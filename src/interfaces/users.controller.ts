import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { UsersService } from '../application/users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUserId, CorrelationId } from '../common/current-user.decorator';
import { DatabaseService } from '../infra/database.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Controller('/api/v1')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly db: DatabaseService
  ) {}

  @Post('/users')
  create(@Body() body: CreateUserDto) {
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
  async patchOwn(@CurrentUserId() userId: string, @Param('id') id: string, @Body() body: UpdateUserDto): Promise<void> {
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
