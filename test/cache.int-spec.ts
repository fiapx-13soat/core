import { RedisContainer, StartedRedisContainer } from '@testcontainers/redis';
import { CacheService } from '../src/infra/cache.service';

/** Integração do CacheService contra Redis real: TTL e a invalidação por SCAN. */
describe('CacheService (integração Redis)', () => {
  jest.setTimeout(120_000);

  let container: StartedRedisContainer;
  let cache: CacheService;

  beforeAll(async () => {
    container = await new RedisContainer('redis:7-alpine').start();
    cache = new CacheService({ get: () => container.getConnectionUrl() } as any);
  });

  afterAll(async () => {
    await cache?.onModuleDestroy();
    await container?.stop();
  });

  it('setEx grava com TTL e get lê de volta', async () => {
    await cache.setEx('k1', 30, 'v1');
    expect(await cache.get('k1')).toBe('v1');
    expect(await cache.get('inexistente')).toBeNull();
  });

  it('invalidateOwnerJobs remove só as chaves do dono', async () => {
    await cache.setEx('jobs:owner-A:x', 30, '1');
    await cache.setEx('jobs:owner-A:y', 30, '2');
    await cache.setEx('jobs:owner-B:z', 30, '3');

    await cache.invalidateOwnerJobs('owner-A');

    expect(await cache.get('jobs:owner-A:x')).toBeNull();
    expect(await cache.get('jobs:owner-A:y')).toBeNull();
    expect(await cache.get('jobs:owner-B:z')).toBe('3'); // do outro dono, intacto
  });
});
