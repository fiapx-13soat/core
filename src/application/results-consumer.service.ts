import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConsumeMessage } from 'amqplib';
import { RabbitMQService } from '../infra/rabbitmq.service';
import { DatabaseService } from '../infra/database.service';
import { CacheService } from '../infra/cache.service';
import { JobStatus, allowedFrom } from '../domain/job-status';
import { jobsCompletedTotal, jobsFailedTotal } from '../infra/metrics';
import { runWithCorrelation } from '../common/correlation-context';

const RESULTS_QUEUE = 'q.core.results';
const RETRY_QUEUE = 'q.core.results.retry';
const DLQ = 'q.core.results.dlq';

/** Backoff por tentativa; o nº de elementos é o nº de retentativas antes da DLQ. */
const RETRY_DELAYS_MS = [1000, 5000, 30000, 120000];

interface ResultEvent {
  eventType: string;
  correlationId: string;
  payload: {
    jobId: string;
    archiveStorageKey?: string;
    sizeBytes?: number;
  };
}

@Injectable()
export class ResultsConsumerService implements OnModuleInit {
  private readonly logger = new Logger(ResultsConsumerService.name);

  constructor(
    private readonly rabbit: RabbitMQService,
    private readonly db: DatabaseService,
    private readonly cache: CacheService
  ) {}

  async onModuleInit(): Promise<void> {
    await this.rabbit.consume(RESULTS_QUEUE, async (message) => {
      // roda no escopo do correlationId da mensagem para os logs do consumo carregarem o id
      await runWithCorrelation(this.correlationIdOf(message), async () => {
        const attempt = Number(message.properties.headers?.['x-retry-count'] ?? 0);
        try {
          const data = JSON.parse(message.content.toString()) as ResultEvent;
          await this.applyResultEvent(data);
        } catch (error) {
          await this.republishOnFailure(message, attempt, error as Error);
        }
        this.rabbit.ack(message);
      });
    });
  }

  /** Best-effort: extrai o correlationId do envelope; undefined se a mensagem for malformada. */
  private correlationIdOf(message: ConsumeMessage): string | undefined {
    try {
      return (JSON.parse(message.content.toString()) as ResultEvent).correlationId;
    } catch {
      return undefined;
    }
  }

  /**
   * Republicação explícita em vez de nack(requeue): o nack devolve a mensagem
   * original ao broker, então a contagem de tentativas gravada no header se
   * perderia e uma mensagem venenosa giraria para sempre. Mesmo padrão do
   * JobFailureHandler do fiapx-workers.
   *
   * O backoff é o `expiration` da mensagem na fila de retry, que faz
   * dead-letter de volta para a fila principal ao expirar — sem bloquear o
   * consumo enquanto espera.
   *
   * Se a republicação falhar (broker fora), o erro sobe e o wrapper do
   * RabbitMQService faz nack com requeue, preservando a mensagem.
   */
  private async republishOnFailure(message: ConsumeMessage, attempt: number, error: Error): Promise<void> {
    const headers = { ...message.properties.headers, 'x-retry-count': attempt + 1 };

    if (attempt >= RETRY_DELAYS_MS.length) {
      this.logger.error(`evento para a DLQ após ${attempt} tentativas: ${error.message}`);
      await this.rabbit.publishToQueue(DLQ, message.content, { headers });
      return;
    }

    this.logger.warn(`falha ao aplicar evento (tentativa ${attempt + 1}): ${error.message}`);
    await this.rabbit.publishToQueue(RETRY_QUEUE, message.content, {
      headers,
      expiration: String(RETRY_DELAYS_MS[attempt])
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
      case 'ProcessingFailed':
        await this.transition(evt.eventType, jobId, JobStatus.FAILED);
        break;
      default:
        break;
    }
  }

  /**
   * Transição inválida não é falha de infra — acontece, por exemplo, quando um
   * job cancelado ainda recebe o resultado do worker. Loga e segue: mandar para
   * retry só repetiria uma transição que nunca vai ser válida.
   */
  private async transition(eventType: string, jobId: string, to: JobStatus): Promise<void> {
    // origem derivada da máquina de estados (domínio), não hardcoded aqui
    const from = allowedFrom(to);
    const applied = await this.db.setJobStatus(jobId, null, from, to);
    if (!applied) {
      this.logger.warn(`${eventType}: transição para ${to} ignorada — job ${jobId} não está em ${from.join('|')}`);
      return;
    }
    // status mudou: derruba o cache da lista do dono para não mostrar estado defasado
    await this.invalidateOwnerCache(jobId);
    // conta o estado terminal só quando a transição de fato aconteceu (não em replay/duplicata)
    if (to === JobStatus.COMPLETED) jobsCompletedTotal.inc();
    else if (to === JobStatus.FAILED) jobsFailedTotal.inc();
  }

  /** Best-effort: descobre o dono do job e invalida o cache da lista dele. Nunca quebra o consumo. */
  private async invalidateOwnerCache(jobId: string): Promise<void> {
    try {
      const job = await this.db.getJobByIdAnyOwner(jobId);
      if (job) await this.cache.invalidateOwnerJobs(job.owner_id);
    } catch (error) {
      this.logger.warn(`falha ao invalidar cache do job ${jobId}: ${(error as Error).message}`);
    }
  }
}
