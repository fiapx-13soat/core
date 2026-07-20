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
}

