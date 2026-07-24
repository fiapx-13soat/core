import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const db: any = {
    findUserByEmail: jest.fn(),
    findValidRefreshToken: jest.fn(),
    rotateRefreshToken: jest.fn(),
    saveRefreshToken: jest.fn(),
  };
  const jwt: any = { signAsync: jest.fn() };
  const config: any = { get: jest.fn() };
  let service: AuthService;

  beforeEach(() => {
    jest.resetAllMocks();
    config.get.mockImplementation((key: string, fallback?: any) => {
      if (key === 'app.accessTokenTtlMinutes') return 15;
      if (key === 'app.refreshTokenTtlDays') return 7;
      return fallback;
    });
    service = new AuthService(db as any, jwt as any as JwtService, config as any as ConfigService);
  });

  it('logs in and issues tokens', async () => {
    db.findUserByEmail.mockResolvedValue({ id: 'u1', active: true, password_hash: 'hash' });
    jest.spyOn(argon2, 'verify').mockResolvedValue(true as never);
    jwt.signAsync.mockResolvedValueOnce('access').mockResolvedValueOnce('access2');
    db.saveRefreshToken.mockResolvedValue(undefined);

    const result = await service.login('EMAIL@test.com', 'pass');

    expect(result.userId).toBe('u1');
    expect(result.tokens.accessToken).toBe('access');
    expect(db.findUserByEmail).toHaveBeenCalledWith('email@test.com');
  });

  it('rejects invalid login', async () => {
    db.findUserByEmail.mockResolvedValue(null);
    await expect(service.login('x@test.com', 'pass')).rejects.toThrow(UnauthorizedException);
  });

  it('rejects inactive user and bad password', async () => {
    db.findUserByEmail.mockResolvedValue({ id: 'u1', active: false, password_hash: 'hash' });
    await expect(service.login('x@test.com', 'pass')).rejects.toThrow(UnauthorizedException);

    db.findUserByEmail.mockResolvedValue({ id: 'u1', active: true, password_hash: 'hash' });
    jest.spyOn(argon2, 'verify').mockResolvedValue(false as never);
    await expect(service.login('x@test.com', 'pass')).rejects.toThrow(UnauthorizedException);
  });

  it('refreshes token and rotates old refresh token', async () => {
    const raw = 'refresh-token';
    db.findValidRefreshToken.mockResolvedValue({ user_id: 'u1' });
    db.rotateRefreshToken.mockResolvedValue(true);
    jwt.signAsync.mockResolvedValue('access');

    const result = await service.refresh(raw);

    expect(result.refreshToken).toBeDefined();
    expect(db.rotateRefreshToken).toHaveBeenCalled();
  });

  it('rejects refresh when token is invalid', async () => {
    db.findValidRefreshToken.mockResolvedValue(null);
    await expect(service.refresh('bad')).rejects.toThrow(UnauthorizedException);
  });

  it('rejects refresh when rotation fails', async () => {
    db.findValidRefreshToken.mockResolvedValue({ user_id: 'u1' });
    db.rotateRefreshToken.mockResolvedValue(false);
    await expect(service.refresh('bad')).rejects.toThrow(UnauthorizedException);
  });

  it('issues tokens directly', async () => {
    jwt.signAsync.mockResolvedValue('access');
    db.saveRefreshToken.mockResolvedValue(undefined);

    const result = await service.issueTokens('u1');

    expect(result.accessToken).toBe('access');
    expect(db.saveRefreshToken).toHaveBeenCalled();
  });
});
