import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface TokenBucket {
  tokens: number;
  lastRefillMs: number;
}

@Injectable()
export class UploadRateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, TokenBucket>();
  private readonly ratePerSecond: number;
  private readonly burst: number;

  constructor(config: ConfigService) {
    this.ratePerSecond = config.get<number>('app.uploadRateLimitPerMinute', 20) / 60;
    this.burst = config.get<number>('app.uploadRateLimitBurst', 5);
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{ user?: { sub: string }; ip: string; res: any }>();
    const key = req.user?.sub ?? req.ip;
    if (!this.allow(key)) {
      req.res.setHeader('Retry-After', '60');
      throw new HttpException('upload rate limit exceeded', HttpStatus.TOO_MANY_REQUESTS);
    }
    return true;
  }

  private allow(key: string): boolean {
    const now = Date.now();
    const found = this.buckets.get(key);
    if (!found) {
      this.buckets.set(key, { tokens: this.burst - 1, lastRefillMs: now });
      return true;
    }

    const elapsedSeconds = (now - found.lastRefillMs) / 1000;
    found.tokens = Math.min(this.burst, found.tokens + elapsedSeconds * this.ratePerSecond);
    found.lastRefillMs = now;
    if (found.tokens < 1) {
      return false;
    }
    found.tokens -= 1;
    return true;
  }
}

