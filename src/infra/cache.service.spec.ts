import { CacheService } from './cache.service';

jest.mock('ioredis', () => {
  const factory = jest.fn();
  (globalThis as any).__redisFactory = factory;
  return { __esModule: true, default: factory };
});

describe('CacheService', () => {
  it('returns null when redis is disabled', async () => {
    const service = new CacheService({ get: () => '' } as any);
    expect(await service.get('k')).toBeNull();
    await service.setEx('k', 10, 'v');
    await service.onModuleDestroy();
  });

  it('delegates to redis client', async () => {
    const quit = jest.fn();
    const get = jest.fn().mockResolvedValue('value');
    const set = jest.fn();
    (globalThis as any).__redisFactory.mockImplementation(() => ({ get, set, quit }));
    const service = new CacheService({ get: () => 'redis://localhost:6379' } as any);

    expect(await service.get('k')).toBe('value');
    await service.setEx('k', 10, 'v');
    await service.onModuleDestroy();

    expect(get).toHaveBeenCalledWith('k');
    expect(set).toHaveBeenCalledWith('k', 'v', 'EX', 10);
    expect(quit).toHaveBeenCalled();
  });

  it('invalidateOwnerJobs varre por SCAN e deleta as chaves do dono (E1)', async () => {
    // SCAN em duas páginas: cursor 5 depois 0
    const scan = jest
      .fn()
      .mockResolvedValueOnce(['5', ['jobs:u1:a', 'jobs:u1:b']])
      .mockResolvedValueOnce(['0', ['jobs:u1:c']]);
    const del = jest.fn();
    (globalThis as any).__redisFactory.mockImplementation(() => ({ scan, del, quit: jest.fn() }));
    const service = new CacheService({ get: () => 'redis://localhost:6379' } as any);

    await service.invalidateOwnerJobs('u1');

    expect(scan).toHaveBeenCalledWith('0', 'MATCH', 'jobs:u1:*', 'COUNT', 100);
    expect(del).toHaveBeenCalledWith('jobs:u1:a', 'jobs:u1:b', 'jobs:u1:c');
  });

  it('invalidateOwnerJobs sem redis é no-op', async () => {
    const service = new CacheService({ get: () => '' } as any);
    await expect(service.invalidateOwnerJobs('u1')).resolves.toBeUndefined();
  });
});
