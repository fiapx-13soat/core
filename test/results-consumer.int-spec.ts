import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RabbitMQContainer, StartedRabbitMQContainer } from '@testcontainers/rabbitmq';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Pool } from 'pg';
import * as amqp from 'amqplib';
import { DatabaseService } from '../src/infra/database.service';
import { CacheService } from '../src/infra/cache.service';
import { RabbitMQService } from '../src/infra/rabbitmq.service';
import { ResultsConsumerService } from '../src/application/results-consumer.service';
import { JobStatus } from '../src/domain/job-status';

const EXCHANGE = 'video.processing';
const QUEUE = 'q.core.results';
const ownerId = '11111111-1111-1111-1111-111111111111';

/**
 * Integração ponta a ponta do consumo de resultados contra RabbitMQ + Postgres reais:
 * o worker publica no exchange, o Core consome e atualiza status; um redelivery de
 * ProcessingCompleted não atualiza duas vezes (CA-C11).
 */
describe('ResultsConsumer (integração RabbitMQ + Postgres)', () => {
  jest.setTimeout(180_000);

  let pg: StartedPostgreSqlContainer;
  let mq: StartedRabbitMQContainer;
  let db: DatabaseService;
  let rabbit: RabbitMQService;
  let pool: Pool;
  let pub: amqp.Channel;
  let pubConn: amqp.ChannelModel;

  const cfg = (over: Record<string, string>) =>
    ({
      get: (k: string) => over[k],
      getOrThrow: (k: string) => over[k]
    }) as any;

  const publish = (eventType: string, jobId: string, extra: Record<string, unknown> = {}) => {
    const routingKey = { ProcessingStarted: 'job.started', ProcessingCompleted: 'job.completed' }[eventType]!;
    const envelope = {
      eventType,
      schemaVersion: 1,
      eventId: 'e',
      occurredAt: new Date().toISOString(),
      correlationId: 'c',
      payload: { jobId, ...extra }
    };
    pub.publish(EXCHANGE, routingKey, Buffer.from(JSON.stringify(envelope)), { persistent: true });
  };

  const waitForStatus = async (jobId: string, status: JobStatus, tries = 60): Promise<string> => {
    for (let i = 0; i < tries; i++) {
      const { rows } = await pool.query('select status from processing_jobs where id = $1', [jobId]);
      if (rows[0]?.status === status) return status;
      await new Promise((r) => setTimeout(r, 500));
    }
    const { rows } = await pool.query('select status from processing_jobs where id = $1', [jobId]);
    return rows[0]?.status;
  };

  beforeAll(async () => {
    [pg, mq] = await Promise.all([
      new PostgreSqlContainer('postgres:16-alpine').start(),
      new RabbitMQContainer('rabbitmq:3.13-alpine').start()
    ]);

    const migration = readFileSync(join(__dirname, '../migrations/001_init.sql'), 'utf8');
    const admin = new Pool({ connectionString: pg.getConnectionUri() });
    await admin.query(migration);
    await admin.query(`insert into users (id, email, name, password_hash) values ($1, 'o@x.com', 'O', 'h')`, [ownerId]);
    await admin.end();

    const amqpUrl = mq.getAmqpUrl();

    // topologia mínima que no sistema real vem do fiapx-infra
    pubConn = await amqp.connect(amqpUrl);
    pub = await pubConn.createChannel();
    await pub.assertExchange(EXCHANGE, 'topic', { durable: true });
    await pub.assertQueue(QUEUE, { durable: true });
    await pub.bindQueue(QUEUE, EXCHANGE, 'job.started');
    await pub.bindQueue(QUEUE, EXCHANGE, 'job.completed');

    db = new DatabaseService(cfg({ 'app.databaseUrl': pg.getConnectionUri() }));
    pool = (db as any).pool as Pool;
    rabbit = new RabbitMQService(cfg({ 'app.amqpUrl': amqpUrl }));
    const cache = new CacheService(cfg({})); // sem redis: invalidação vira no-op

    const consumer = new ResultsConsumerService(rabbit, db, cache);
    await consumer.onModuleInit();
  });

  afterAll(async () => {
    await pub?.close();
    await pubConn?.close();
    await rabbit?.onModuleDestroy();
    await db?.onModuleDestroy();
    await Promise.all([pg?.stop(), mq?.stop()]);
  });

  it('aplica started->completed e ignora redelivery de completed (CA-C11)', async () => {
    const jobId = 'job-int-1';
    await db.createVideoAndJob({
      videoId: '22222222-2222-2222-2222-222222222222',
      ownerId,
      filename: 'v.mp4',
      contentType: 'video/mp4',
      sizeBytes: 10,
      checksum: 'c1',
      storageKey: 'videos/1.mp4',
      jobId
    });
    await db.setJobStatus(jobId, ownerId, [JobStatus.RECEIVED], JobStatus.QUEUED);

    publish('ProcessingStarted', jobId);
    expect(await waitForStatus(jobId, JobStatus.PROCESSING)).toBe('PROCESSING');

    publish('ProcessingCompleted', jobId);
    expect(await waitForStatus(jobId, JobStatus.COMPLETED)).toBe('COMPLETED');

    const { rows: before } = await pool.query('select updated_at from processing_jobs where id = $1', [jobId]);
    // redelivery: não deve regredir nem reaplicar
    publish('ProcessingCompleted', jobId);
    await new Promise((r) => setTimeout(r, 2000));
    const { rows: after } = await pool.query('select status, updated_at from processing_jobs where id = $1', [jobId]);
    expect(after[0].status).toBe('COMPLETED');
    expect(after[0].updated_at).toEqual(before[0].updated_at); // não houve segundo UPDATE
  });
});
