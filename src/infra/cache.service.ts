import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly redis: Redis | null;

  constructor(private readonly config: ConfigService) {
    const url = this.config.get<string>('app.redisUrl');
    this.redis = url ? new Redis(url) : null;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      await this.redis.quit();
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.redis) {
      return null;
    }
    return this.redis.get(key);
  }

  async setEx(key: string, ttlSeconds: number, value: string): Promise<void> {
    if (!this.redis) {
      return;
    }
    await this.redis.set(key, value, 'EX', ttlSeconds);
  }

  /**
   * Invalida o cache de listagem de um dono (chaves `jobs:{ownerId}:*`). Usado quando o status
   * de um job muda, para a lista não ficar defasada até o TTL. SCAN (não KEYS) para não bloquear
   * o Redis.
   */
  async invalidateOwnerJobs(ownerId: string): Promise<void> {
    if (!this.redis) {
      return;
    }
    const pattern = `jobs:${ownerId}:*`;
    const keys: string[] = [];
    let cursor = '0';
    do {
      const [next, batch] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = next;
      keys.push(...batch);
    } while (cursor !== '0');
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }
}
