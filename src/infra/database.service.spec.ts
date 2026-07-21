import { ConfigService } from '@nestjs/config';
import { DatabaseService } from './database.service';
import { JobStatus } from '../domain/job-status';

jest.mock('pg', () => ({
  Pool: jest.fn()
}));

describe('DatabaseService', () => {
  let service: DatabaseService;
  let mockPool: any;

  beforeEach(() => {
    jest.resetAllMocks();
    mockPool = { query: jest.fn(), connect: jest.fn(), end: jest.fn() };
    const { Pool } = require('pg');
    Pool.mockImplementation(() => mockPool);
    service = new DatabaseService({ get: () => 'postgres://db' } as any as ConfigService);
    (service as any).pool = mockPool;
  });

  it('runs ready and query helpers', async () => {
    mockPool.query.mockResolvedValue({ rows: [], rowCount: 0 });
    mockPool.connect.mockResolvedValue({ query: jest.fn().mockResolvedValue({}), release: jest.fn() });
    await expect(service.ready()).resolves.toBe(true);
    await service.createUser({ id: '1', email: 'e', name: 'n', passwordHash: 'h' });
    await service.findUserByEmail('e');
    await service.findUserById('1');
    await service.updateUserName('1', 'x');
    await service.deactivateUser('1');
    await service.saveRefreshToken('1', 'h', new Date());
    await service.findValidRefreshToken('h');
    await service.createVideoAndJob({ videoId: 'v', ownerId: '1', filename: 'f', contentType: 'c', sizeBytes: 1, checksum: 'c', storageKey: 'k', jobId: 'j' });
    await service.setJobStatus('j', '1', [JobStatus.RECEIVED], JobStatus.QUEUED);
    await service.createJob({ jobId: 'j2', ownerId: '1', videoId: 'v', status: JobStatus.RECEIVED });
    await service.getJobById('j', '1');
    await service.getJobByIdAnyOwner('j');
    await service.listJobs({ ownerId: '1', limit: 10 });
    await service.getVideoById('v', '1');
    await service.setArchive('j', 'k', 1);
    await service.insertAuditLog({ ownerId: '1', action: 'a', correlationId: 'c', metadata: {} });
    expect(mockPool.query).toHaveBeenCalled();
  });

  it('rotates refresh token and reports uniqueness', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    client.query.mockResolvedValueOnce({}).mockResolvedValueOnce({ rowCount: 1 }).mockResolvedValueOnce({});
    mockPool.connect.mockResolvedValue(client);
    await expect(service.rotateRefreshToken('old', 'new', 'u1', new Date())).resolves.toBe(true);
    expect(service.isUniqueViolation({ code: '23505' })).toBe(true);
    expect(service.isUniqueViolation({ code: 'x' })).toBe(false);
  });

  it('closes the pool on destroy', async () => {
    await service.onModuleDestroy();
    expect(mockPool.end).toHaveBeenCalled();
  });
});

