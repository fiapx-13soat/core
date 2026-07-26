import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConsumeMessage } from 'amqplib';
import { RabbitMQService } from '../infra/rabbitmq.service';
import { DatabaseService } from '../infra/database.service';
import { CacheService } from '../infra/cache.service';
import { JobStatus, allowedFrom } from '../domain/job-status';
import { jobsCompletedTotal, jobsFailedTotal } from '../infra/metrics';
import { runWithCorrelation, addEventFields } from '../common/correlation-context';
import { emitCanonicalEvent } from '../common/canonical-event';

const RESULTS_QUEUE = 'q.core.results';
const RETRY_QUEUE = 'q.core.results.retry';
const DLQ = 'q.core.results.dlq';

const RETRY_DELAYS_MS = [1000, 5000, 30000, 120000];

interface ResultEvent {
  eventType: string;
  correlationId: string;
  payload: {
    jobId: string;
    archiveStorageKey?: string;
    sizeBytes?: number;
    errorCode?: string;
    errorMessage?: string;
  };
}

@Injectable()
export class ResultsConsumerService implements OnModuleInit {
  private readonly logger = new Logger(ResultsConsumerService.name);

  constructor(
    private readonly rabbit: RabbitMQService,
    private readonly db: DatabaseService,
    private readonly cache: CacheService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.rabbit.consume(RESULTS_QUEUE, async (message) => {
      // roda no escopo do correlationId da mensagem para os logs do consumo carregarem o id
      await runWithCorrelation(this.correlationIdOf(message), async () => {
        const attempt = Number(message.properties.headers?.['x-retry-count'] ?? 0);
        const start = Date.now();
        let eventType: string | undefined;
        let outcome: 'ok' | 'error' = 'ok';
        try {
          const data = JSON.parse(message.content.toString()) as ResultEvent;
          eventType = data.eventType;
          addEventFields({ eventType, jobId: data.payload?.jobId });
          await this.applyResultEvent(data);
        } catch (error) {
          outcome = 'error';
          await this.republishOnFailure(message, attempt, error as Error);
        }
        this.rabbit.ack(message);
        emitCanonicalEvent({
          event: 'result_consumed',
          eventType,
          attempt,
          outcome,
          durationMs: Date.now() - start,
        });
      });
    });
  }

  private correlationIdOf(message: ConsumeMessage): string | undefined {
    try {
      return (JSON.parse(message.content.toString()) as ResultEvent).correlationId;
    } catch {
      return undefined;
    }
  }

  /**
   * Republica na fila de retry em vez de nack(requeue): o nack devolve a mensagem original, então
   * a contagem de tentativas no header se perderia e uma mensagem venenosa giraria para sempre. O
   * backoff é o `expiration` da mensagem na retry queue, que faz dead-letter de volta à principal
   * ao expirar. Se a republicação falhar, o erro sobe e o wrapper faz nack com requeue.
   */
  private async republishOnFailure(
    message: ConsumeMessage,
    attempt: number,
    error: Error,
  ): Promise<void> {
    const headers = { ...message.properties.headers, 'x-retry-count': attempt + 1 };

    if (attempt >= RETRY_DELAYS_MS.length) {
      this.logger.error(`evento para a DLQ após ${attempt} tentativas: ${error.message}`);
      await this.rabbit.publishToQueue(DLQ, message.content, { headers });
      return;
    }

    this.logger.warn(`falha ao aplicar evento (tentativa ${attempt + 1}): ${error.message}`);
    await this.rabbit.publishToQueue(RETRY_QUEUE, message.content, {
      headers,
      expiration: String(RETRY_DELAYS_MS[attempt]),
    });
  }

  private async applyResultEvent(evt: ResultEvent): Promise<void> {
    const jobId = evt.payload.jobId;
    switch (evt.eventType) {
      case 'ProcessingStarted':
        await this.transition(evt.eventType, jobId, JobStatus.PROCESSING);
        break;
      case 'ProcessingCompleted':
        await this.transition(evt.eventType, jobId, JobStatus.COMPLETED);
        break;
      case 'ArchiveReady':
        if (!evt.payload.archiveStorageKey) {
          throw new Error('archiveStorageKey missing');
        }
        await this.db.setArchive(jobId, evt.payload.archiveStorageKey, evt.payload.sizeBytes ?? 0);
        break;
      case 'ProcessingFailed': {
        const applied = await this.transition(evt.eventType, jobId, JobStatus.FAILED);
        // grava o motivo (errorCode/errorMessage) só quando a transição valeu — para o job
        // detail expor por que falhou, alinhado ao e-mail de erro.
        if (applied) {
          await this.db.setJobError(
            jobId,
            evt.payload.errorCode ?? null,
            evt.payload.errorMessage ?? null,
          );
        }
        break;
      }
      default:
        break;
    }
  }

  // Transição inválida não é falha de infra (ex.: job cancelado que ainda recebe o resultado do
  // worker): loga e segue — mandar para retry só repetiria uma transição que nunca será válida.
  private async transition(eventType: string, jobId: string, to: JobStatus): Promise<boolean> {
    const from = allowedFrom(to);
    const applied = await this.db.setJobStatus(jobId, null, from, to);
    if (!applied) {
      this.logger.warn(
        `${eventType}: transição para ${to} ignorada — job ${jobId} não está em ${from.join('|')}`,
      );
      return false;
    }
    await this.invalidateOwnerCache(jobId);
    // conta o estado terminal uma vez só: em replay/duplicata a transição não se aplica
    if (to === JobStatus.COMPLETED) jobsCompletedTotal.inc();
    else if (to === JobStatus.FAILED) jobsFailedTotal.inc();
    return true;
  }

  // best-effort: uma falha ao invalidar o cache não pode derrubar o consumo
  private async invalidateOwnerCache(jobId: string): Promise<void> {
    try {
      const job = await this.db.getJobByIdAnyOwner(jobId);
      if (job) await this.cache.invalidateOwnerJobs(job.owner_id);
    } catch (error) {
      this.logger.warn(`falha ao invalidar cache do job ${jobId}: ${(error as Error).message}`);
    }
  }
}
