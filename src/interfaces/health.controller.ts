import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from '../infra/database.service';

@Controller()
export class HealthController {
  constructor(private readonly db: DatabaseService) {}

  @Get('/health')
  health() {
    return { status: 'ok' };
  }

  @Get('/ready')
  async ready() {
    try {
      await this.db.ready();
      return { status: 'ready' };
    } catch (error) {
      throw new ServiceUnavailableException({ status: 'not_ready', error: (error as Error).message });
    }
  }
}

