import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { DatabaseService } from '../infra/database.service';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresInSec: number;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly db: DatabaseService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService
  ) {}

  async login(email: string, password: string): Promise<{ userId: string; tokens: TokenPair }> {
    const user = await this.db.findUserByEmail(email.toLowerCase().trim());
    if (!user || !user.active) {
      throw new UnauthorizedException('invalid credentials');
    }
    const ok = await argon2.verify(user.password_hash, password);
    if (!ok) {
      throw new UnauthorizedException('invalid credentials');
    }
    const tokens = await this.issueTokens(user.id);
    return { userId: user.id, tokens };
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const oldHash = this.hashToken(refreshToken);
    const found = await this.db.findValidRefreshToken(oldHash);
    if (!found) {
      throw new UnauthorizedException('invalid refresh token');
    }

    const newRaw = this.newOpaqueToken();
    const newHash = this.hashToken(newRaw);
    const refreshDays = this.config.get<number>('app.refreshTokenTtlDays', 7);
    const expiresAt = new Date(Date.now() + refreshDays * 24 * 60 * 60 * 1000);
    const rotated = await this.db.rotateRefreshToken(oldHash, newHash, found.user_id, expiresAt);
    if (!rotated) {
      throw new UnauthorizedException('invalid refresh token');
    }

    const accessMinutes = this.config.get<number>('app.accessTokenTtlMinutes', 15);
    const accessToken = await this.jwt.signAsync(
      { sub: found.user_id },
      { expiresIn: `${accessMinutes}m`, jwtid: randomBytes(8).toString('hex') }
    );

    return {
      accessToken,
      refreshToken: newRaw,
      expiresInSec: accessMinutes * 60
    };
  }

  async issueTokens(userId: string): Promise<TokenPair> {
    const accessMinutes = this.config.get<number>('app.accessTokenTtlMinutes', 15);
    const refreshDays = this.config.get<number>('app.refreshTokenTtlDays', 7);

    const accessToken = await this.jwt.signAsync(
      { sub: userId },
      { expiresIn: `${accessMinutes}m`, jwtid: randomBytes(8).toString('hex') }
    );
    const refreshToken = this.newOpaqueToken();
    const refreshHash = this.hashToken(refreshToken);

    await this.db.saveRefreshToken(userId, refreshHash, new Date(Date.now() + refreshDays * 24 * 60 * 60 * 1000));

    return {
      accessToken,
      refreshToken,
      expiresInSec: accessMinutes * 60
    };
  }

  private newOpaqueToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}
