import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { RabbitMQService } from '../infra/rabbitmq.service';
import { DatabaseService } from '../infra/database.service';
import { JobStatus } from '../domain/job-status';

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
    private readonly db: DatabaseService
  ) {}

  async onModuleInit(): Promise<void> {
    await this.rabbit.consume('q.core.results', async (message) => {
      const retries = Number(message.properties.headers?.['x-retry'] ?? 0);
      try {
        const data = JSON.parse(message.content.toString()) as ResultEvent;
        await this.applyResultEvent(data);
        this.rabbit.ack(message);
      } catch (error) {
        if (retries >= 4) {
          this.logger.error('sending message to DLQ', error as Error);
          this.rabbit.nack(message, false);
          return;
        }

        const waits = [1000, 5000, 30000, 120000];
        await new Promise((resolve) => setTimeout(resolve, waits[retries]));
        message.properties.headers = {
          ...message.properties.headers,
          'x-retry': retries + 1
        };
        this.rabbit.nack(message, true);
      }
    });
  }

  private async applyResultEvent(evt: ResultEvent): Promise<void> {
    const jobId = evt.payload.jobId;
    switch (evt.eventType) {
      case 'ProcessingStarted':
        await this.db.setJobStatus(jobId, null, [JobStatus.QUEUED], JobStatus.PROCESSING);
        break;
      case 'ProcessingCompleted':
        await this.db.setJobStatus(jobId, null, [JobStatus.PROCESSING], JobStatus.COMPLETED);
        break;
      case 'ArchiveReady':
        if (!evt.payload.archiveStorageKey) {
          throw new Error('archiveStorageKey missing');
        }
        await this.db.setArchive(jobId, evt.payload.archiveStorageKey, evt.payload.sizeBytes ?? 0);
        break;
      case 'ProcessingFailed':
        await this.db.setJobStatus(jobId, null, [JobStatus.QUEUED, JobStatus.PROCESSING], JobStatus.FAILED);
        break;
      default:
        break;
    }
  }
}

