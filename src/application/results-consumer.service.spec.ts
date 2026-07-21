import { ResultsConsumerService } from './results-consumer.service';
import { JobStatus } from '../domain/job-status';

describe('ResultsConsumerService', () => {
  const rabbit: any = { consume: jest.fn(), ack: jest.fn(), nack: jest.fn() };
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

  it('nacks to dlq after retries and ignores malformed archive payloads', async () => {
    const timeout = jest.spyOn(global, 'setTimeout').mockImplementation(((cb: any) => {
      cb();
      return 0 as any;
    }) as any);

    rabbit.consume.mockImplementation(async (_queue: string, onMessage: any) => {
      await onMessage({ content: Buffer.from('not-json'), properties: { headers: { 'x-retry': 4 } } });
      await onMessage({ content: Buffer.from(JSON.stringify({ eventType: 'ArchiveReady', payload: { jobId: 'j1' } })), properties: { headers: {} } });
    });

    await service.onModuleInit();
    timeout.mockRestore();

    expect(rabbit.nack).toHaveBeenCalledWith(expect.any(Object), false);
  });

  it('acks unknown event types', async () => {
    rabbit.consume.mockImplementation(async (_queue: string, onMessage: any) => {
      await onMessage({ content: Buffer.from(JSON.stringify({ eventType: 'SomethingElse', payload: { jobId: 'j1' } })), properties: { headers: {} } });
    });

    await service.onModuleInit();
    expect(rabbit.ack).toHaveBeenCalled();
  });
});

