import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { DatabaseService } from '../infra/database.service';

@Injectable()
export class UsersService {
  constructor(private readonly db: DatabaseService) {}

  async createUser(input: { email: string; name: string; password: string }): Promise<{ id: string; email: string; name: string }> {
    const id = randomUUID();
    const email = input.email.toLowerCase().trim();
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });

    try {
      await this.db.createUser({ id, email, name: input.name.trim(), passwordHash });
    } catch (error) {
      if (this.db.isUniqueViolation(error)) {
        throw new ConflictException('email already exists');
      }
      throw error;
    }

    return { id, email, name: input.name.trim() };
  }

  async getOwnUser(userId: string, requestedId: string): Promise<{ id: string; email: string; name: string; active: boolean }> {
    if (userId !== requestedId) {
      throw new NotFoundException('user not found');
    }
    const user = await this.db.findUserById(userId);
    if (!user) {
      throw new NotFoundException('user not found');
    }
    return { id: user.id, email: user.email, name: user.name, active: user.active };
  }

  async patchOwnUser(userId: string, requestedId: string, name: string): Promise<void> {
    if (userId !== requestedId) {
      throw new NotFoundException('user not found');
    }
    await this.db.updateUserName(userId, name.trim());
  }

  async deleteOwnUser(userId: string, requestedId: string): Promise<void> {
    if (userId !== requestedId) {
      throw new NotFoundException('user not found');
    }
    await this.db.deactivateUser(userId);
  }
}

