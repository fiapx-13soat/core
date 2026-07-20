import amqp from 'amqplib';
import { RabbitMQService } from './rabbitmq.service';

jest.mock('amqplib', () => ({ __esModule: true, default: { connect: jest.fn() } }));

describe('RabbitMQService', () => {
  it('connects, publishes, consumes and closes', async () => {
    const publish = jest.fn().mockResolvedValue(undefined);
    const waitForConfirms = jest.fn().mockResolvedValue(undefined);
    const ack = jest.fn();
    const nack = jest.fn();
    const consume = jest.fn().mockResolvedValue(undefined);
    const close = jest.fn().mockResolvedValue(undefined);
    const connection: any = {
      createConfirmChannel: jest.fn().mockResolvedValue({ publish, waitForConfirms, close }),
      createChannel: jest.fn().mockResolvedValue({ consume, ack, nack, close }),
      close
    };
    (amqp.connect as jest.Mock).mockResolvedValue(connection);

    const service = new RabbitMQService({ getOrThrow: () => 'amqp://localhost' } as any);
    await service.publishConfirmed('ex', 'rk', { eventType: 'E', schemaVersion: '1', eventId: '1', occurredAt: '', correlationId: 'c', payload: {} });
    await service.consume('q', async () => undefined);
    service.ack({} as any);
    service.nack({} as any, true);
    await service.onModuleDestroy();

    expect(connection.createConfirmChannel).toHaveBeenCalled();
    expect(connection.createChannel).toHaveBeenCalled();
    expect(publish).toHaveBeenCalled();
    expect(consume).toHaveBeenCalled();
    expect(ack).toHaveBeenCalled();
    expect(nack).toHaveBeenCalled();
    expect(close).toHaveBeenCalled();
  });

  it('nacks when consumer callback fails and ignores null messages', async () => {
    const publish = jest.fn().mockResolvedValue(undefined);
    const waitForConfirms = jest.fn().mockResolvedValue(undefined);
    const ack = jest.fn();
    const nack = jest.fn();
    const close = jest.fn().mockResolvedValue(undefined);
    const consume = jest.fn(async (_queue: string, handler: any) => {
      await handler(null);
      await handler({ content: Buffer.from('x'), properties: { headers: {} } });
    });
    const connection: any = {
      createConfirmChannel: jest.fn().mockResolvedValue({ publish, waitForConfirms, close }),
      createChannel: jest.fn().mockResolvedValue({ consume, ack, nack, close }),
      close
    };
    (amqp.connect as jest.Mock).mockResolvedValue(connection);

    const service = new RabbitMQService({ getOrThrow: () => 'amqp://localhost' } as any);
    await service.consume('q', async () => {
      throw new Error('boom');
    });

    expect(nack).toHaveBeenCalledWith(expect.any(Object), false, true);
  });
});

