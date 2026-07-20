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
});

