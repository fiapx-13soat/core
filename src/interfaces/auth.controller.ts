import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from '../application/auth.service';
import { CorrelationId } from '../common/current-user.decorator';
import { DatabaseService } from '../infra/database.service';

@Controller('/api/v1/auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly db: DatabaseService
  ) {}

  @Post('/login')
  async login(
    @Body() body: { email: string; password: string },
    @CorrelationId() correlationId: string
  ) {
    const result = await this.auth.login(body.email, body.password);
    await this.db.insertAuditLog({
      ownerId: result.userId,
      action: 'login',
      correlationId,
      metadata: { email: body.email.toLowerCase() }
    });
    return result.tokens;
  }

  @Post('/refresh')
  refresh(@Body() body: { refreshToken: string }) {
    return this.auth.refresh(body.refreshToken);
  }
}

