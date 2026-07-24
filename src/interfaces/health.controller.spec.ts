import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  const healthyRabbit: any = { isHealthy: jest.fn().mockResolvedValue(true) };

  it('returns ok and ready states', async () => {
    const db: any = { ready: jest.fn().mockResolvedValue(true) };
    const controller = new HealthController(db, healthyRabbit);
    expect(controller.health()).toEqual({ status: 'ok' });
    await expect(controller.ready()).resolves.toEqual({ status: 'ready' });
  });

  it('wraps readiness failure', async () => {
    const db: any = { ready: jest.fn().mockRejectedValue(new Error('db down')) };
    const controller = new HealthController(db, healthyRabbit);
    await expect(controller.ready()).rejects.toThrow(ServiceUnavailableException);
  });

  it('is not ready without broker', async () => {
    const db: any = { ready: jest.fn().mockResolvedValue(true) };
    const rabbit: any = { isHealthy: jest.fn().mockResolvedValue(false) };
    const controller = new HealthController(db, rabbit);
    await expect(controller.ready()).rejects.toThrow(ServiceUnavailableException);
  });
});
