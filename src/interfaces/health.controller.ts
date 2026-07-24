import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DatabaseService } from '../infra/database.service';
import { RabbitMQService } from '../infra/rabbitmq.service';

@Controller()
export class HealthController {
  constructor(
    private readonly db: DatabaseService,
    private readonly rabbit: RabbitMQService,
  ) {}

  @Get('/health')
  health() {
    return { status: 'ok' };
  }

  /** O core não processa nada sem broker: readiness sem AMQP faria o depends_on do compose mentir. */
  @Get('/ready')
  async ready() {
    try {
      await this.db.ready();
      if (!(await this.rabbit.isHealthy())) {
        throw new Error('broker unavailable');
      }
      return { status: 'ready' };
    } catch (error) {
      throw new ServiceUnavailableException({
        status: 'not_ready',
        error: (error as Error).message,
      });
    }
  }
}
