import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { StructuredLogger } from './common/structured-logger';

jest.mock('@nestjs/core', () => ({ NestFactory: { create: jest.fn() } }));

describe('bootstrap', () => {
  it('creates app and listens', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';
    const listen = jest.fn().mockResolvedValue(undefined);
    const app = {
      useLogger: jest.fn(),
      useGlobalPipes: jest.fn(),
      get: jest.fn().mockReturnValue({ get: () => 1234 }),
      listen,
    };
    (NestFactory.create as jest.Mock).mockResolvedValue(app);

    const { bootstrap } = require('./main');
    await bootstrap();

    process.env.NODE_ENV = prev;

    expect(NestFactory.create).toHaveBeenCalled();
    expect(app.useLogger).toHaveBeenCalledWith(expect.any(StructuredLogger));
    expect(app.useGlobalPipes).toHaveBeenCalledWith(expect.any(ValidationPipe));
    expect(listen).toHaveBeenCalledWith(1234);
  });
});
