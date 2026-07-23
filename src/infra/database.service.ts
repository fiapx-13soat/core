import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, QueryResult, QueryResultRow } from 'pg';
import { JobStatus } from '../domain/job-status';
import { UserRow, JobRow, JobListRow, VideoRow } from './rows';

export interface JobListFilters {
  ownerId: string;
  status?: string;
  from?: Date;
  to?: Date;
  cursor?: Date;
  limit: number;
}

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly pool: Pool;

  constructor(private readonly config: ConfigService) {
    this.pool = new Pool({ connectionString: this.config.get<string>('app.databaseUrl') });
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  query<T extends QueryResultRow>(text: string, values: unknown[] = []): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, values);
  }

  async ready(): Promise<boolean> {
    await this.query('select 1');
    return true;
  }

  async createUser(input: { id: string; email: string; name: string; passwordHash: string }): Promise<void> {
    await this.query(
      `insert into users (id, email, name, password_hash, active, created_at, updated_at)
       values ($1, $2, $3, $4, true, now(), now())`,
      [input.id, input.email, input.name, input.passwordHash]
    );
  }

  async findUserByEmail(email: string): Promise<UserRow | null> {
    const { rows } = await this.query<UserRow>('select * from users where email = $1', [email]);
    return rows[0] ?? null;
  }

  async findUserById(id: string): Promise<UserRow | null> {
    const { rows } = await this.query<UserRow>('select * from users where id = $1', [id]);
    return rows[0] ?? null;
  }

  async updateUserName(id: string, name: string): Promise<void> {
    await this.query('update users set name = $2, updated_at = now() where id = $1 and active = true', [id, name]);
  }

  async deactivateUser(id: string): Promise<void> {
    await this.query('update users set active = false, updated_at = now() where id = $1', [id]);
  }

  async saveRefreshToken(userId: string, tokenHash: string, expiresAt: Date): Promise<void> {
    await this.query(
      'insert into refresh_tokens (id, user_id, token_hash, expires_at, revoked, created_at) values (gen_random_uuid(), $1, $2, $3, false, now())',
      [userId, tokenHash, expiresAt]
    );
  }

  async rotateRefreshToken(oldHash: string, newHash: string, userId: string, expiresAt: Date): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const updated = await client.query(
        'update refresh_tokens set revoked = true where user_id = $1 and token_hash = $2 and revoked = false and expires_at > now()',
        [userId, oldHash]
      );
      if (updated.rowCount !== 1) {
        await client.query('rollback');
        return false;
      }
      await client.query(
        'insert into refresh_tokens (id, user_id, token_hash, expires_at, revoked, created_at) values (gen_random_uuid(), $1, $2, $3, false, now())',
        [userId, newHash, expiresAt]
      );
      await client.query('commit');
      return true;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async findValidRefreshToken(tokenHash: string): Promise<{ user_id: string } | null> {
    const { rows } = await this.query<{ user_id: string }>(
      'select user_id from refresh_tokens where token_hash = $1 and revoked = false and expires_at > now()',
      [tokenHash]
    );
    return rows[0] ?? null;
  }

  async createVideoAndJob(input: {
    videoId: string;
    ownerId: string;
    filename: string;
    contentType: string;
    sizeBytes: number;
    checksum: string;
    storageKey: string;
    jobId: string;
  }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await client.query(
        `insert into videos (id, owner_id, filename, content_type, size_bytes, checksum, storage_key, created_at)
         values ($1, $2, $3, $4, $5, $6, $7, now())`,
        [
          input.videoId,
          input.ownerId,
          input.filename,
          input.contentType,
          input.sizeBytes,
          input.checksum,
          input.storageKey
        ]
      );
      await client.query(
        `insert into processing_jobs (id, owner_id, video_id, status, created_at, updated_at)
         values ($1, $2, $3, $4, now(), now())`,
        [input.jobId, input.ownerId, input.videoId, JobStatus.RECEIVED]
      );
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async setJobStatus(jobId: string, ownerId: string | null, fromStatuses: JobStatus[], toStatus: JobStatus): Promise<boolean> {
    const params: unknown[] = [toStatus, jobId];
    let sql = 'update processing_jobs set status = $1, updated_at = now() where id = $2';
    if (ownerId) {
      sql += ' and owner_id = $3';
      params.push(ownerId);
    }
    if (fromStatuses.length > 0) {
      sql += ` and status = any($${params.length + 1})`;
      params.push(fromStatuses);
    }
    const result = await this.query(sql, params);
    return result.rowCount === 1;
  }

  async createJob(input: { jobId: string; ownerId: string; videoId: string; status: JobStatus }): Promise<void> {
    await this.query(
      `insert into processing_jobs (id, owner_id, video_id, status, created_at, updated_at)
       values ($1, $2, $3, $4, now(), now())`,
      [input.jobId, input.ownerId, input.videoId, input.status]
    );
  }

  async getJobById(jobId: string, ownerId: string): Promise<JobRow | null> {
    const { rows } = await this.query<JobRow>('select * from processing_jobs where id = $1 and owner_id = $2', [jobId, ownerId]);
    return rows[0] ?? null;
  }

  async getJobByIdAnyOwner(jobId: string): Promise<JobRow | null> {
    const { rows } = await this.query<JobRow>('select * from processing_jobs where id = $1', [jobId]);
    return rows[0] ?? null;
  }

  async listJobs(filters: JobListFilters): Promise<JobListRow[]> {
    const values: unknown[] = [filters.ownerId];
    let idx = 2;
    let sql =
      'select id, video_id, status, archive_storage_key, created_at from processing_jobs where owner_id = $1';
    if (filters.status) {
      sql += ` and status = $${idx++}`;
      values.push(filters.status);
    }
    if (filters.from) {
      sql += ` and created_at >= $${idx++}`;
      values.push(filters.from);
    }
    if (filters.to) {
      sql += ` and created_at <= $${idx++}`;
      values.push(filters.to);
    }
    if (filters.cursor) {
      sql += ` and created_at < $${idx++}`;
      values.push(filters.cursor);
    }
    sql += ` order by created_at desc limit $${idx}`;
    values.push(filters.limit);
    const { rows } = await this.query<JobListRow>(sql, values);
    return rows;
  }

  async getVideoById(videoId: string, ownerId: string): Promise<VideoRow | null> {
    const { rows } = await this.query<VideoRow>('select * from videos where id = $1 and owner_id = $2', [videoId, ownerId]);
    return rows[0] ?? null;
  }

  async setArchive(jobId: string, storageKey: string, sizeBytes: number): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      await client.query(
        `insert into result_archives (id, job_id, storage_key, size_bytes, created_at)
         values (gen_random_uuid(), $1, $2, $3, now())
         on conflict (job_id) do update set storage_key = excluded.storage_key, size_bytes = excluded.size_bytes`,
        [jobId, storageKey, sizeBytes]
      );
      await client.query('update processing_jobs set archive_storage_key = $2, updated_at = now() where id = $1', [jobId, storageKey]);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async insertAuditLog(input: { ownerId: string | null; action: string; correlationId: string; metadata: Record<string, unknown> }): Promise<void> {
    await this.query(
      `insert into audit_logs (id, owner_id, action, correlation_id, metadata_json, created_at)
       values (gen_random_uuid(), $1, $2, $3, $4::jsonb, now())`,
      [input.ownerId, input.action, input.correlationId, JSON.stringify(input.metadata)]
    );
  }

  isUniqueViolation(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) {
      return false;
    }
    const maybe = error as { code?: string };
    return maybe.code === '23505';
  }
}

