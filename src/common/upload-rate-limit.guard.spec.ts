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
    const guard = new UploadRateLimitGuard({
      get: (key: string) => (key.includes('Minute') ? 60 : 2),
    } as any);
    const req: any = { user: { sub: 'u1' }, ip: '127.0.0.1', res: { setHeader: jest.fn() } };
    const ctx: any = { switchToHttp: () => ({ getRequest: () => req }) };

    expect(guard.canActivate(ctx)).toBe(true);
    expect(guard.canActivate(ctx)).toBe(true);
    expect(() => guard.canActivate(ctx)).toThrow(HttpException);
  });

  it('uses ip when user is absent', () => {
    const guard = new UploadRateLimitGuard({
      get: (key: string) => (key.includes('Minute') ? 60 : 1),
    } as any);
    const req: any = { ip: '127.0.0.1', res: { setHeader: jest.fn() } };
    const ctx: any = { switchToHttp: () => ({ getRequest: () => req }) };
    expect(guard.canActivate(ctx)).toBe(true);
  });

  it('Retry-After reflete a janela real, não um valor fixo (E4)', () => {
    // 60/min = 1 token/s, burst 1 → após o 1º request, faltam ~1s para o próximo
    const guard = new UploadRateLimitGuard({
      get: (key: string) => (key.includes('Minute') ? 60 : 1),
    } as any);
    const setHeader = jest.fn();
    const req: any = { user: { sub: 'u1' }, ip: '127.0.0.1', res: { setHeader } };
    const ctx: any = { switchToHttp: () => ({ getRequest: () => req }) };

    expect(guard.canActivate(ctx)).toBe(true); // consome o único token
    expect(() => guard.canActivate(ctx)).toThrow(HttpException);
    expect(setHeader).toHaveBeenCalledWith('Retry-After', '1');
  });

  it('Retry-After maior quando a taxa é mais lenta (E4)', () => {
    // 6/min = 0.1 token/s, burst 1 → ~10s para repor 1 token
    const guard = new UploadRateLimitGuard({
      get: (key: string) => (key.includes('Minute') ? 6 : 1),
    } as any);
    const setHeader = jest.fn();
    const req: any = { user: { sub: 'u2' }, ip: '127.0.0.1', res: { setHeader } };
    const ctx: any = { switchToHttp: () => ({ getRequest: () => req }) };

    expect(guard.canActivate(ctx)).toBe(true);
    expect(() => guard.canActivate(ctx)).toThrow(HttpException);
    expect(setHeader).toHaveBeenCalledWith('Retry-After', '10');
  });
});
