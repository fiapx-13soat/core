import { HttpException } from '@nestjs/common';
import { UploadRateLimitGuard } from './upload-rate-limit.guard';

describe('UploadRateLimitGuard', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(1000);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('allows first request and rate limited after burst', () => {
    const guard = new UploadRateLimitGuard({ get: (key: string) => (key.includes('Minute') ? 60 : 2) } as any);
    const req: any = { user: { sub: 'u1' }, ip: '127.0.0.1', res: { setHeader: jest.fn() } };
    const ctx: any = { switchToHttp: () => ({ getRequest: () => req }) };

    expect(guard.canActivate(ctx)).toBe(true);
    expect(guard.canActivate(ctx)).toBe(true);
    expect(() => guard.canActivate(ctx)).toThrow(HttpException);
  });

  it('uses ip when user is absent', () => {
    const guard = new UploadRateLimitGuard({ get: (key: string) => (key.includes('Minute') ? 60 : 1) } as any);
    const req: any = { ip: '127.0.0.1', res: { setHeader: jest.fn() } };
    const ctx: any = { switchToHttp: () => ({ getRequest: () => req }) };
    expect(guard.canActivate(ctx)).toBe(true);
  });
});

