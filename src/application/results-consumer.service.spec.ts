import { ResultsConsumerService } from './results-consumer.service';
import { JobStatus } from '../domain/job-status';

describe('ResultsConsumerService', () => {
  const rabbit: any = {
    consume: jest.fn(),
    ack: jest.fn(),
    nack: jest.fn(),
    publishToQueue: jest.fn().mockResolvedValue(undefined)
  };
  const db: any = { setJobStatus: jest.fn(), setArchive: jest.fn() };
  let service: ResultsConsumerService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new ResultsConsumerService(rabbit as any, db as any);
  });

  it('subscribes to queue on init', async () => {
    rabbit.consume.mockResolvedValue(undefined);
    await service.onModuleInit();
    expect(rabbit.consume).toHaveBeenCalledWith('q.core.results', expect.any(Function));
  });

  it('applies events and acks', async () => {
    const messages: any[] = [];
    rabbit.consume.mockImplementation(async (_queue: string, onMessage: any) => {
      const msg = (content: unknown) => ({ content: Buffer.from(JSON.stringify(content)), properties: { headers: {} } });
      messages.push(onMessage(msg({ eventType: 'ProcessingStarted', payload: { jobId: 'j1' } })));
      messages.push(onMessage(msg({ eventType: 'ArchiveReady', payload: { jobId: 'j1', archiveStorageKey: 'zip', sizeBytes: 1 } })));
      messages.push(onMessage(msg({ eventType: 'ProcessingCompleted', payload: { jobId: 'j1' } })));
      messages.push(onMessage(msg({ eventType: 'ProcessingFailed', payload: { jobId: 'j1' } })));
    });

    await service.onModuleInit();
    await Promise.all(messages);
    expect(db.setJobStatus).toHaveBeenCalledWith('j1', null, [JobStatus.QUEUED], JobStatus.PROCESSING);
    expect(db.setArchive).toHaveBeenCalledWith('j1', 'zip', 1);
  });

  it('republishes to the retry queue with backoff on first failures', async () => {
    rabbit.publishToQueue.mockResolvedValue(undefined);
    rabbit.consume.mockImplementation(async (_queue: string, onMessage: any) => {
      // ArchiveReady sem archiveStorageKey — payload malformado
      await onMessage({
        content: Buffer.from(JSON.stringify({ eventType: 'ArchiveReady', payload: { jobId: 'j1' } })),
        properties: { headers: { 'x-retry': 1 } }
      });
    });

    await service.onModuleInit();

    expect(rabbit.publishToQueue).toHaveBeenCalledWith(
      'q.core.results.retry',
      expect.any(Buffer),
      { headers: { 'x-retry': 2 }, expiration: '5000' }
    );
    expect(rabbit.ack).toHaveBeenCalled();
  });

  it('sends to dlq once retries are exhausted', async () => {
    rabbit.publishToQueue.mockResolvedValue(undefined);
    rabbit.consume.mockImplementation(async (_queue: string, onMessage: any) => {
      await onMessage({
        content: Buffer.from('not-json'),
        properties: { headers: { 'x-retry': 4 } }
      });
    });

    await service.onModuleInit();

    expect(rabbit.publishToQueue).toHaveBeenCalledWith('q.core.results.dlq', expect.any(Buffer), {
      headers: { 'x-retry': 5 }
    });
  });

  it('ignores invalid transitions instead of retrying them', async () => {
    rabbit.publishToQueue.mockResolvedValue(undefined);
    db.setJobStatus.mockResolvedValue(false);
    rabbit.consume.mockImplementation(async (_queue: string, onMessage: any) => {
      await onMessage({
        content: Buffer.from(JSON.stringify({ eventType: 'ProcessingCompleted', payload: { jobId: 'j1' } })),
        properties: { headers: {} }
      });
    });

    await service.onModuleInit();

    expect(rabbit.publishToQueue).not.toHaveBeenCalled();
    expect(rabbit.ack).toHaveBeenCalled();
  });

  it('acks unknown event types', async () => {
    rabbit.consume.mockImplementation(async (_queue: string, onMessage: any) => {
      await onMessage({ content: Buffer.from(JSON.stringify({ eventType: 'SomethingElse', payload: { jobId: 'j1' } })), properties: { headers: {} } });
    });

    await service.onModuleInit();
    expect(rabbit.ack).toHaveBeenCalled();
  });
});

