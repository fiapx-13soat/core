import {
  BadRequestException,
  BadGatewayException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID, createHash } from 'crypto';
import { Express } from 'express';
import { CacheService } from '../infra/cache.service';
import { DatabaseService } from '../infra/database.service';
import { EventEnvelope, RabbitMQService } from '../infra/rabbitmq.service';
import { S3Service } from '../infra/s3.service';
import { JobStatus, isFinalStatus, allowedFrom } from '../domain/job-status';
import { JobRow, JobListRow } from '../infra/rows';
import { jobsCreatedTotal } from '../infra/metrics';

export interface JobListItem {
  id: string;
  videoId: string;
  status: JobStatus;
  createdAt: string;
  downloadAvailable: boolean;
}

export interface JobDetail {
  id: string;
  videoId: string;
  status: JobStatus;
  downloadAvailable: boolean;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class JobsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly rabbit: RabbitMQService,
    private readonly s3: S3Service,
    private readonly cache: CacheService,
    private readonly config: ConfigService,
  ) {}

  async uploadVideo(
    userId: string,
    correlationId: string,
    file?: Express.Multer.File,
  ): Promise<{ jobId: string; status: JobStatus }> {
    if (!file) {
      throw new BadRequestException('missing video file');
    }

    const maxBytes = this.config.get<number>('app.uploadMaxBytes', 500 * 1024 * 1024);
    if (file.size > maxBytes) {
      throw new PayloadTooLargeException('file too large');
    }

    if (!this.isValidVideo(file.originalname, file.buffer)) {
      throw new BadRequestException('invalid file format');
    }

    const checksum = createHash('sha256').update(file.buffer).digest('hex');
    const videoId = randomUUID();
    const extension = file.originalname.slice(file.originalname.lastIndexOf('.'));
    const storageKey = `videos/${userId}/${videoId}${extension || '.mp4'}`;

    await this.s3.upload(
      this.config.getOrThrow<string>('app.s3BucketVideos'),
      storageKey,
      file.buffer,
      file.mimetype,
    );

    const jobId = randomUUID();
    await this.db.createVideoAndJob({
      videoId,
      ownerId: userId,
      filename: file.originalname,
      contentType: file.mimetype,
      sizeBytes: file.size,
      checksum,
      storageKey,
      jobId,
    });

    const event: EventEnvelope = {
      eventType: 'ProcessingRequested',
      schemaVersion: 1,
      eventId: randomUUID(),
      occurredAt: new Date().toISOString(),
      correlationId,
      payload: {
        jobId,
        videoStorageKey: storageKey,
        parameters: { fps: 1 },
        ownerId: userId,
      },
    };

    // QUEUED antes de publicar: o worker pode consumir e publicar job.started
    // antes deste update, e a transição QUEUED -> PROCESSING não encontraria o
    // job em QUEUED — ele ficaria preso em RECEIVED para sempre.
    await this.db.setJobStatus(jobId, userId, allowedFrom(JobStatus.QUEUED), JobStatus.QUEUED);

    try {
      await this.rabbit.publishConfirmed('video.processing', 'job.requested', event);
    } catch {
      await this.db.setJobStatus(jobId, userId, allowedFrom(JobStatus.FAILED), JobStatus.FAILED);
      throw new BadGatewayException('processing broker unavailable');
    }

    await this.db.insertAuditLog({
      ownerId: userId,
      action: 'upload_video',
      correlationId,
      metadata: { jobId, videoId },
    });

    jobsCreatedTotal.inc();
    return { jobId, status: JobStatus.QUEUED };
  }

  async listJobs(
    userId: string,
    query: { status?: string; from?: string; to?: string; cursor?: string; limit?: string },
  ): Promise<{ items: JobListItem[]; nextCursor: string | null }> {
    const limit = Math.min(Number(query.limit ?? 20), 100);
    const from = query.from ? new Date(query.from) : undefined;
    const to = query.to ? new Date(query.to) : undefined;
    const cursor = query.cursor ? new Date(query.cursor) : undefined;

    const cacheKey = `jobs:${userId}:${query.status ?? ''}:${query.from ?? ''}:${query.to ?? ''}:${query.cursor ?? ''}:${limit}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) {
      const items = JSON.parse(cached) as JobListItem[];
      return { items, nextCursor: this.nextCursor(items, limit) };
    }

    const rows = await this.db.listJobs({
      ownerId: userId,
      status: query.status,
      from,
      to,
      cursor,
      limit,
    });
    const items = rows.map((r) => this.toJobListItem(r));
    await this.cache.setEx(cacheKey, 10, JSON.stringify(items));

    return { items, nextCursor: this.nextCursor(items, limit) };
  }

  // DTO estável da listagem: camelCase, sem vazar coluna crua do banco. `downloadAvailable`
  // sinaliza que o sistema produziu um ZIP (COMPLETED + archive gravado) — o link em si
  // sai do GET /jobs/{id}/download-link, que faz a checagem real de existência/expiração.
  private toJobListItem(row: JobListRow): JobListItem {
    return {
      id: row.id,
      videoId: row.video_id,
      status: row.status,
      createdAt: row.created_at,
      downloadAvailable: row.status === JobStatus.COMPLETED && !!row.archive_storage_key,
    };
  }

  private nextCursor(items: JobListItem[], limit: number): string | null {
    return items.length === limit ? items[items.length - 1].createdAt : null;
  }

  /** Linha crua do banco, para uso interno (cancel/reprocess/download). Não vaza para HTTP. */
  private async getJobRow(userId: string, jobId: string): Promise<JobRow> {
    const job = await this.db.getJobById(jobId, userId);
    if (!job) {
      throw new NotFoundException('job not found');
    }
    return job;
  }

  async getJob(userId: string, jobId: string): Promise<JobDetail> {
    return this.toJobDetail(await this.getJobRow(userId, jobId));
  }

  // DTO de detalhe: camelCase, sem vazar owner_id nem a storage key interna. downloadAvailable
  // segue a mesma regra da listagem; o link em si sai do /download-link.
  private toJobDetail(row: JobRow): JobDetail {
    return {
      id: row.id,
      videoId: row.video_id,
      status: row.status,
      downloadAvailable: row.status === JobStatus.COMPLETED && !!row.archive_storage_key,
      errorCode: row.error_code,
      errorMessage: row.error_message,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async cancelJob(
    userId: string,
    correlationId: string,
    jobId: string,
  ): Promise<{ status: JobStatus }> {
    const job = await this.getJobRow(userId, jobId);
    if (isFinalStatus(job.status)) {
      throw new ConflictException('finalized jobs cannot be cancelled');
    }

    const ok = await this.db.setJobStatus(
      jobId,
      userId,
      allowedFrom(JobStatus.CANCELLED),
      JobStatus.CANCELLED,
    );
    if (!ok) {
      throw new ConflictException('unable to cancel');
    }

    try {
      await this.rabbit.publishConfirmed('video.processing', 'job.cancelled', {
        eventType: 'ProcessingCancelled',
        schemaVersion: 1,
        eventId: randomUUID(),
        occurredAt: new Date().toISOString(),
        correlationId,
        payload: { jobId },
      });
    } catch {
      throw new BadGatewayException('processing broker unavailable');
    }

    await this.db.insertAuditLog({
      ownerId: userId,
      action: 'cancel_job',
      correlationId,
      metadata: { jobId },
    });
    return { status: JobStatus.CANCELLED };
  }

  async reprocessJob(
    userId: string,
    correlationId: string,
    jobId: string,
  ): Promise<{ jobId: string }> {
    const job = await this.getJobRow(userId, jobId);
    const video = await this.db.getVideoById(job.video_id, userId);
    if (!video) {
      throw new NotFoundException('job not found');
    }
    // o vídeo original pode ter expirado no bucket — não reenfileira o que não dá para processar
    const videosBucket = this.config.getOrThrow<string>('app.s3BucketVideos');
    if (!(await this.s3.exists(videosBucket, video.storage_key))) {
      throw new GoneException('source video no longer available');
    }
    const newJobId = randomUUID();
    await this.db.createJob({
      jobId: newJobId,
      ownerId: userId,
      videoId: job.video_id,
      status: JobStatus.RECEIVED,
    });

    await this.db.setJobStatus(newJobId, userId, allowedFrom(JobStatus.QUEUED), JobStatus.QUEUED);

    try {
      await this.rabbit.publishConfirmed('video.processing', 'job.requested', {
        eventType: 'ProcessingRequested',
        schemaVersion: 1,
        eventId: randomUUID(),
        occurredAt: new Date().toISOString(),
        correlationId,
        payload: {
          jobId: newJobId,
          ownerId: userId,
          videoStorageKey: video.storage_key,
          parameters: { fps: 1 },
        },
      });
    } catch {
      await this.db.setJobStatus(newJobId, userId, allowedFrom(JobStatus.FAILED), JobStatus.FAILED);
      throw new BadGatewayException('processing broker unavailable');
    }

    return { jobId: newJobId };
  }

  async getDownloadLink(
    userId: string,
    jobId: string,
  ): Promise<{ url: string; expiresInSec: number }> {
    const job = await this.getJobRow(userId, jobId);
    if (job.status !== JobStatus.COMPLETED || !job.archive_storage_key) {
      throw new ConflictException('job archive not available');
    }

    const bucket = this.config.getOrThrow<string>('app.s3BucketArchives');
    const exists = await this.s3.exists(bucket, job.archive_storage_key);
    if (!exists) {
      // ZIP sumiu (lifecycle do bucket): marca o job EXPIRED — antes ele ficava COMPLETED
      // para sempre, com o download dando 410 sem o status refletir isso.
      await this.db.setJobStatus(jobId, userId, allowedFrom(JobStatus.EXPIRED), JobStatus.EXPIRED);
      throw new GoneException('archive expired');
    }

    const url = await this.s3.presignedGet(bucket, job.archive_storage_key, 900);
    return { url, expiresInSec: 900 };
  }

  async getNotificationInfo(jobId: string): Promise<{ ownerEmail: string; videoFilename: string }> {
    const job = await this.db.getJobByIdAnyOwner(jobId);
    if (!job) {
      throw new NotFoundException('job not found');
    }
    const user = await this.db.findUserById(job.owner_id);
    const video = await this.db.getVideoById(job.video_id, job.owner_id);
    if (!user || !video) {
      throw new NotFoundException('job not found');
    }
    return { ownerEmail: user.email, videoFilename: video.filename };
  }

  private isValidVideo(filename: string, buffer: Buffer): boolean {
    const ext = filename.toLowerCase().split('.').pop() ?? '';
    const allowed = ['mp4', 'mov', 'mkv', 'avi', 'webm'];
    if (!allowed.includes(ext)) {
      return false;
    }

    const header = buffer.subarray(0, 16);
    const hasFtyp = buffer.subarray(0, 64).includes(Buffer.from('ftyp'));
    const isRiffAvi =
      header.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'AVI ';
    const isMkv =
      header[0] === 0x1a && header[1] === 0x45 && header[2] === 0xdf && header[3] === 0xa3;
    return hasFtyp || isRiffAvi || isMkv || ext === 'webm';
  }
}
