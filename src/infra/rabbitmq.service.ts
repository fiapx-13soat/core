import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import amqp, { Channel, ConfirmChannel, ConsumeMessage } from 'amqplib';

export interface EventEnvelope {
  eventType: string;
  schemaVersion: number;
  eventId: string;
  occurredAt: string;
  correlationId: string;
  payload: Record<string, unknown>;
}

@Injectable()
export class RabbitMQService implements OnModuleDestroy {
  private connection: any = null;
  private confirmChannel: ConfirmChannel | null = null;
  private consumeChannel: Channel | null = null;
  private readonly logger = new Logger(RabbitMQService.name);

  constructor(private readonly config: ConfigService) {}

  async onModuleDestroy(): Promise<void> {
    await this.consumeChannel?.close();
    await this.confirmChannel?.close();
    await this.connection?.close();
  }

  private async ensureConnected(): Promise<void> {
    if (this.connection && this.confirmChannel && this.consumeChannel) {
      return;
    }
    this.connection = await amqp.connect(this.config.getOrThrow<string>('app.amqpUrl'));
    this.confirmChannel = await this.connection.createConfirmChannel();
    this.consumeChannel = await this.connection.createChannel();
  }

  async publishConfirmed(exchange: string, routingKey: string, event: EventEnvelope): Promise<void> {
    await this.ensureConnected();
    const payload = Buffer.from(JSON.stringify(event));
    await this.confirmChannel!.publish(exchange, routingKey, payload, {
      contentType: 'application/json',
      persistent: true
    });
    await this.confirmChannel!.waitForConfirms();
  }

  /**
   * Publica direto numa fila pelo default exchange. Usado para republicação
   * explícita (retry com backoff e DLQ), onde o destino é a fila e não um
   * roteamento por routing key.
   */
  async publishToQueue(
    queue: string,
    content: Buffer,
    options: { headers?: Record<string, unknown>; expiration?: string } = {}
  ): Promise<void> {
    await this.ensureConnected();
    await this.confirmChannel!.publish('', queue, content, {
      contentType: 'application/json',
      persistent: true,
      ...options
    });
    await this.confirmChannel!.waitForConfirms();
  }

  /**
   * prefetch(1) serializa o consumo: sem ele o amqplib entrega várias mensagens
   * em paralelo e eventos do mesmo job (archive.ready e job.completed) podem ser
   * aplicados fora de ordem.
   */
  async consume(queue: string, onMessage: (msg: ConsumeMessage) => Promise<void>): Promise<void> {
    await this.ensureConnected();
    await this.consumeChannel!.prefetch(1);
    await this.consumeChannel!.consume(queue, async (msg) => {
      if (!msg) {
        return;
      }
      try {
        await onMessage(msg);
      } catch (error) {
        this.logger.error('consumer callback failure', error as Error);
        this.consumeChannel!.nack(msg, false, true);
      }
    });
  }

  ack(msg: ConsumeMessage): void {
    this.consumeChannel?.ack(msg);
  }

  nack(msg: ConsumeMessage, requeue: boolean): void {
    this.consumeChannel?.nack(msg, false, requeue);
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.ensureConnected();
      return this.connection !== null && this.consumeChannel !== null;
    } catch {
      return false;
    }
  }
}

