import { BadGatewayException, BadRequestException, ConflictException, GoneException, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../infra/cache.service';
import { JobsService } from './jobs.service';
import { JobStatus } from '../domain/job-status';

describe('JobsService', () => {
  const db: any = {
    createVideoAndJob: jest.fn(),
    setJobStatus: jest.fn(),
    insertAuditLog: jest.fn(),
    listJobs: jest.fn(),
    getJobById: jest.fn(),
    getVideoById: jest.fn(),
    createJob: jest.fn(),
    getJobByIdAnyOwner: jest.fn(),
    setArchive: jest.fn(),
    findUserById: jest.fn()
  };
  const rabbit: any = { publishConfirmed: jest.fn() };
  const s3: any = { upload: jest.fn(), exists: jest.fn(), presignedGet: jest.fn() };
  const cache: any = { get: jest.fn(), setEx: jest.fn() };
  const config: any = { get: jest.fn(), getOrThrow: jest.fn() };
  let service: JobsService;

  beforeEach(() => {
    jest.resetAllMocks();
    config.get.mockImplementation((key: string, fallback?: any) => {
      if (key === 'app.uploadMaxBytes') return 10;
      if (key === 'app.uploadRateLimitPerMinute') return 20;
      if (key === 'app.uploadRateLimitBurst') return 5;
      return fallback;
    });
    config.getOrThrow.mockImplementation((key: string) => (key === 'app.s3BucketVideos' ? 'videos' : 'archives'));
    service = new JobsService(db as any, rabbit as any, s3 as any, cache as any as CacheService, config as any as ConfigService);
  });

  it('rejects missing or invalid upload', async () => {
    await expect(service.uploadVideo('u1', 'cid')).rejects.toThrow(BadRequestException);
    await expect(service.uploadVideo('u1', 'cid', { size: 20 } as any)).rejects.toThrow(PayloadTooLargeException);
    await expect(service.uploadVideo('u1', 'cid', { size: 1, originalname: 'a.txt', buffer: Buffer.from('x'), mimetype: 'text/plain' } as any)).rejects.toThrow(BadRequestException);
  });

  it('uploads and publishes job', async () => {
    s3.upload.mockResolvedValue(undefined);
    db.createVideoAndJob.mockResolvedValue(undefined);
    rabbit.publishConfirmed.mockResolvedValue(undefined);
    db.setJobStatus.mockResolvedValue(true);
    db.insertAuditLog.mockResolvedValue(undefined);

    const file = { size: 1, originalname: 'video.mp4', buffer: Buffer.from('ftypaaaa'), mimetype: 'video/mp4' } as any;
    const result = await service.uploadVideo('u1', 'cid', file);

    expect(result.status).toBe(JobStatus.QUEUED);
    expect(db.createVideoAndJob).toHaveBeenCalled();
    expect(rabbit.publishConfirmed).toHaveBeenCalled();
    // QUEUED tem que estar gravado antes do publish, senão o job.started do
    // worker pode chegar com o job ainda em RECEIVED e travá-lo lá
    expect(db.setJobStatus.mock.invocationCallOrder[0]).toBeLessThan(
      rabbit.publishConfirmed.mock.invocationCallOrder[0]
    );
  });

  it('fails when broker is unavailable', async () => {
    s3.upload.mockResolvedValue(undefined);
    db.createVideoAndJob.mockResolvedValue(undefined);
    db.setJobStatus.mockResolvedValue(true);
    rabbit.publishConfirmed.mockRejectedValue(new Error('broker'));
    const file = { size: 1, originalname: 'video.mp4', buffer: Buffer.from('ftypaaaa'), mimetype: 'video/mp4' } as any;
    await expect(service.uploadVideo('u1', 'cid', file)).rejects.toThrow(BadGatewayException);
    // não pode ficar QUEUED sem ninguém para consumir
    expect(db.setJobStatus).toHaveBeenLastCalledWith(
      expect.any(String),
      'u1',
      [JobStatus.QUEUED],
      JobStatus.FAILED
    );
  });

  it('lists jobs with and without cache', async () => {
    // cache guarda o DTO já mapeado (camelCase); fresh vem da linha crua do banco
    cache.get
      .mockResolvedValueOnce(JSON.stringify([{ id: 'j0', videoId: 'v0', status: 'QUEUED', createdAt: '1', downloadAvailable: false }]))
      .mockResolvedValueOnce(null);
    db.listJobs.mockResolvedValue([
      { id: 'j1', video_id: 'v1', status: 'PROCESSING', archive_storage_key: null, created_at: '2' }
    ]);

    const cached = await service.listJobs('u1', {});
    const fresh = await service.listJobs('u1', {});

    expect(cached.items).toHaveLength(1);
    expect(fresh.items).toHaveLength(1);
    // DTO estável, camelCase, sem coluna crua
    expect(fresh.items[0]).toEqual({
      id: 'j1',
      videoId: 'v1',
      status: 'PROCESSING',
      createdAt: '2',
      downloadAvailable: false
    });
  });

  it('marca downloadAvailable só para COMPLETED com archive', async () => {
    cache.get.mockResolvedValue(null);
    db.listJobs.mockResolvedValue([
      { id: 'a', video_id: 'v', status: 'COMPLETED', archive_storage_key: 'archives/a.zip', created_at: '3' },
      { id: 'b', video_id: 'v', status: 'COMPLETED', archive_storage_key: null, created_at: '2' },
      { id: 'c', video_id: 'v', status: 'PROCESSING', archive_storage_key: 'archives/c.zip', created_at: '1' }
    ]);

    const { items } = await service.listJobs('u1', {});

    expect(items.map((i) => i.downloadAvailable)).toEqual([true, false, false]);
  });

  it('gets job and handles cancel/reprocess/download paths', async () => {
    let call = 0;
    db.getJobById.mockImplementation(async () => {
      call += 1;
      return call < 4
        ? { status: JobStatus.PROCESSING, video_id: 'v1', archive_storage_key: 'a.zip' }
        : { status: JobStatus.COMPLETED, video_id: 'v1', archive_storage_key: 'a.zip' };
    });
    db.setJobStatus.mockResolvedValue(true);
    rabbit.publishConfirmed.mockResolvedValue(undefined);
    db.insertAuditLog.mockResolvedValue(undefined);
    db.getVideoById.mockResolvedValue({ storage_key: 'video-key' });
    s3.exists.mockResolvedValue(true);
    s3.presignedGet.mockResolvedValue('signed');

    await expect(service.getJob('u1', 'j1')).resolves.toBeDefined();
    await expect(service.cancelJob('u1', 'cid', 'j1')).resolves.toEqual({ status: JobStatus.CANCELLED });
    await expect(service.reprocessJob('u1', 'cid', 'j1')).resolves.toEqual({ jobId: expect.any(String) });
    await expect(service.getDownloadLink('u1', 'j1')).resolves.toEqual({ url: 'signed', expiresInSec: 900 });
  });

  it('covers final job and missing archive branches', async () => {
    db.getJobById.mockResolvedValue({ status: JobStatus.COMPLETED, archive_storage_key: 'a.zip' });
    s3.exists.mockResolvedValue(false);
    await expect(service.cancelJob('u1', 'cid', 'j1')).rejects.toThrow();
    await expect(service.getDownloadLink('u1', 'j1')).rejects.toThrow(GoneException);
  });

  it('covers not-found and conflict branches', async () => {
    db.getJobById.mockResolvedValue(null);
    await expect(service.getJob('u1', 'missing')).rejects.toThrow(NotFoundException);

    db.getJobById.mockResolvedValue({ status: JobStatus.COMPLETED, video_id: 'v1', archive_storage_key: 'a.zip' });
    await expect(service.cancelJob('u1', 'cid', 'j1')).rejects.toThrow(ConflictException);

    db.getJobById.mockResolvedValue({ status: JobStatus.PROCESSING, video_id: 'v1', archive_storage_key: 'a.zip' });
    db.setJobStatus.mockResolvedValue(false);
    await expect(service.cancelJob('u1', 'cid', 'j1')).rejects.toThrow(ConflictException);
  });

  it('covers reprocess broker and notification missing branches', async () => {
    db.getJobById.mockResolvedValue({ status: JobStatus.PROCESSING, video_id: 'v1', archive_storage_key: 'a.zip' });
    db.getVideoById.mockResolvedValue(null);
    await expect(service.reprocessJob('u1', 'cid', 'j1')).rejects.toThrow(NotFoundException);

    db.getVideoById.mockResolvedValue({ storage_key: 'video-key' });
    rabbit.publishConfirmed.mockRejectedValueOnce(new Error('broker'));
    await expect(service.reprocessJob('u1', 'cid', 'j1')).rejects.toThrow(BadGatewayException);

    db.getJobByIdAnyOwner.mockResolvedValue(null);
    await expect(service.getNotificationInfo('missing')).rejects.toThrow(NotFoundException);
  });

  it('returns notification info or not found', async () => {
    db.getJobByIdAnyOwner.mockResolvedValue({ owner_id: 'u1', video_id: 'v1' });
    db.findUserById.mockResolvedValue({ email: 'e@example.com' });
    db.getVideoById.mockResolvedValue({ filename: 'a.mp4' });
    await expect(service.getNotificationInfo('j1')).resolves.toEqual({ ownerEmail: 'e@example.com', videoFilename: 'a.mp4' });
    db.getJobByIdAnyOwner.mockResolvedValue(null);
    await expect(service.getNotificationInfo('missing')).rejects.toThrow(NotFoundException);
  });
});

