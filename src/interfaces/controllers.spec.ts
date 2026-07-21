import { AuthController } from './auth.controller';
import { HealthController } from './health.controller';
import { InternalController } from './internal.controller';
import { JobsController } from './jobs.controller';
import { MetricsController } from './metrics.controller';
import { UsersController } from './users.controller';
import { VideosController } from './videos.controller';

describe('controllers', () => {
  it('delegates auth and user actions', async () => {
    const authSvc: any = { login: jest.fn().mockResolvedValue({ userId: 'u1', tokens: { a: 1 } }), refresh: jest.fn().mockResolvedValue({ b: 2 }) };
    const db: any = { insertAuditLog: jest.fn() };
    const auth = new AuthController(authSvc, db);
    await auth.login({ email: 'e', password: 'p' }, 'cid');
    await auth.refresh({ refreshToken: 'r' });
    expect(db.insertAuditLog).toHaveBeenCalled();

    const usersSvc: any = {
      createUser: jest.fn().mockResolvedValue({ id: 'u1' }),
      getOwnUser: jest.fn().mockResolvedValue({ id: 'u1' }),
      patchOwnUser: jest.fn().mockResolvedValue(undefined),
      deleteOwnUser: jest.fn().mockResolvedValue(undefined)
    };
    const users = new UsersController(usersSvc, db);
    await users.create({ email: 'e', name: 'n', password: 'p' });
    await users.getOwn('u1', 'u1');
    await users.patchOwn('u1', 'u1', { name: 'x' });
    await users.deleteOwn('u1', 'u1', 'cid');
    expect(db.insertAuditLog).toHaveBeenCalled();
  });

  it('delegates jobs/internal/health/metrics/videos', async () => {
    const jobsSvc: any = {
      listJobs: jest.fn().mockResolvedValue({ items: [] }),
      getJob: jest.fn().mockResolvedValue({}),
      cancelJob: jest.fn().mockResolvedValue({}),
      reprocessJob: jest.fn().mockResolvedValue({}),
      getDownloadLink: jest.fn().mockResolvedValue({}),
      getNotificationInfo: jest.fn().mockResolvedValue({})
    };
    const jobs = new JobsController(jobsSvc);
    const internal = new InternalController(jobsSvc);
    const health = new HealthController({ ready: jest.fn().mockResolvedValue(true) } as any);
    const metrics = new MetricsController();
    const videos = new VideosController(jobsSvc);

    await jobs.list('u1', {} as any);
    await jobs.get('u1', 'j1');
    await jobs.cancel('u1', 'cid', 'j1');
    await jobs.reprocess('u1', 'cid', 'j1');
    await jobs.downloadLink('u1', 'j1');
    await internal.getNotificationInfo('j1');
    await health.health();
    await expect(health.ready()).resolves.toBeDefined();
    await metrics.metrics();
    expect(videos).toBeDefined();
  });
});

