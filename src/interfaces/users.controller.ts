import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { UsersService } from '../application/users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserId, CorrelationId } from '../common/current-user.decorator';
import { DatabaseService } from '../infra/database.service';

@Controller('/api/v1')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly db: DatabaseService
  ) {}

  @Post('/users')
  create(@Body() body: { email: string; name: string; password: string }) {
    return this.users.createUser(body);
  }

  @UseGuards(JwtAuthGuard)
  @Get('/users/:id')
  getOwn(@CurrentUserId() userId: string, @Param('id') id: string) {
    return this.users.getOwnUser(userId, id);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  @Patch('/users/:id')
  async patchOwn(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @Body() body: { name: string }
  ): Promise<void> {
    await this.users.patchOwnUser(userId, id, body.name);
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(204)
  @Delete('/users/:id')
  async deleteOwn(
    @CurrentUserId() userId: string,
    @Param('id') id: string,
    @CorrelationId() correlationId: string
  ): Promise<void> {
    await this.users.deleteOwnUser(userId, id);
    await this.db.insertAuditLog({ ownerId: userId, action: 'delete_account', correlationId, metadata: {} });
  }
}

