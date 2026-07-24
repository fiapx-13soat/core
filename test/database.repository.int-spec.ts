import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Pool } from 'pg';
import { DatabaseService } from '../src/infra/database.service';
import { JobStatus, allowedFrom } from '../src/domain/job-status';

/**
 * Integração do DatabaseService contra Postgres real. Guardas de máquina de estados
 * (setJobStatus filtrando por status de origem), transação de createVideoAndJob e a
 * idempotência do setArchive (ON CONFLICT) só se verificam num banco de verdade.
 */
describe('DatabaseService (integração Postgres)', () => {
  jest.setTimeout(120_000);

  let container: StartedPostgreSqlContainer;
  let db: DatabaseService;
  let pool: Pool;

  const config = (uri: string) => ({ get: () => uri }) as any;

  // ids fixos para as FKs (users <- videos <- processing_jobs)
  const ownerId = '11111111-1111-1111-1111-111111111111';

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16-alpine').start();
    const migration = readFileSync(join(__dirname, '../migrations/001_init.sql'), 'utf8');
    const admin = new Pool({ connectionString: container.getConnectionUri() });
    await admin.query(migration);
    await admin.query(`insert into users (id, email, name, password_hash) values ($1, 'o@x.com', 'O', 'h')`, [ownerId]);
    await admin.end();

    db = new DatabaseService(config(container.getConnectionUri()));
    pool = (db as any).pool as Pool;
  });

  afterAll(async () => {
    await db?.onModuleDestroy();
    await container?.stop();
  });

  afterEach(async () => {
    await pool.query('delete from result_archives');
    await pool.query('delete from processing_jobs');
    await pool.query('delete from videos');
  });

  const seedJob = async (jobId: string, status = JobStatus.RECEIVED) => {
    const videoId = '22222222-2222-2222-2222-222222222222';
    await db.createVideoAndJob({
      videoId,
      ownerId,
      filename: 'v.mp4',
      contentType: 'video/mp4',
      sizeBytes: 10,
      checksum: `c-${jobId}`,
      storageKey: `videos/${jobId}.mp4`,
      jobId
    });
    if (status !== JobStatus.RECEIVED) {
      await pool.query('update processing_jobs set status = $2 where id = $1', [jobId, status]);
    }
    return videoId;
  };

  it('createVideoAndJob grava vídeo + job na mesma transação', async () => {
    await seedJob('job-1');
    const { rows: v } = await pool.query('select count(*)::int c from videos');
    const { rows: j } = await pool.query('select status from processing_jobs where id = $1', ['job-1']);
    expect(v[0].c).toBe(1);
    expect(j[0].status).toBe('RECEIVED');
  });

  it('setJobStatus respeita a guarda de origem (máquina de estados)', async () => {
    await seedJob('job-2', JobStatus.QUEUED);

    // QUEUED -> PROCESSING é válido a partir de allowedFrom(PROCESSING)
    expect(await db.setJobStatus('job-2', null, allowedFrom(JobStatus.PROCESSING), JobStatus.PROCESSING)).toBe(true);
    // repetir não aplica (já não está em QUEUED) — base da idempotência CA-C11
    expect(await db.setJobStatus('job-2', null, allowedFrom(JobStatus.PROCESSING), JobStatus.PROCESSING)).toBe(false);

    const { rows } = await pool.query('select status from processing_jobs where id = $1', ['job-2']);
    expect(rows[0].status).toBe('PROCESSING');
  });

  it('setArchive é idempotente (ON CONFLICT job_id) — CA-C11', async () => {
    await seedJob('job-3', JobStatus.PROCESSING);

    await db.setArchive('job-3', 'archives/job-3.zip', 100);
    await db.setArchive('job-3', 'archives/job-3.zip', 200); // redelivery

    const { rows: ra } = await pool.query('select count(*)::int c, max(size_bytes) s from result_archives');
    expect(ra[0].c).toBe(1); // não duplicou
    expect(Number(ra[0].s)).toBe(200); // atualizou

    const { rows: pj } = await pool.query('select archive_storage_key from processing_jobs where id = $1', ['job-3']);
    expect(pj[0].archive_storage_key).toBe('archives/job-3.zip');
  });

  it('rotateRefreshToken troca o token na mesma transação', async () => {
    await db.saveRefreshToken(ownerId, 'old-hash', new Date(Date.now() + 60_000));
    const ok = await db.rotateRefreshToken('old-hash', 'new-hash', ownerId, new Date(Date.now() + 60_000));
    expect(ok).toBe(true);

    const found = await db.findValidRefreshToken('new-hash');
    expect(found).toBeTruthy();
    expect(await db.findValidRefreshToken('old-hash')).toBeNull();
  });
});
