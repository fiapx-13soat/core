import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('returns ok and ready states', async () => {
    const db: any = { ready: jest.fn().mockResolvedValue(true) };
    const controller = new HealthController(db);
    expect(controller.health()).toEqual({ status: 'ok' });
    await expect(controller.ready()).resolves.toEqual({ status: 'ready' });
  });

  it('wraps readiness failure', async () => {
    const db: any = { ready: jest.fn().mockRejectedValue(new Error('db down')) };
    const controller = new HealthController(db);
    await expect(controller.ready()).rejects.toThrow(ServiceUnavailableException);
  });
});

