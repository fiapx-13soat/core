import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

export async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(new Logger());
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const config = app.get(ConfigService);
  const port = config.get<number>('app.port', 8080);

  await app.listen(port);
  Logger.log(`fiapx-core listening on port ${port}`);
}

/* istanbul ignore next */
if (process.env.NODE_ENV !== 'test') {
  void bootstrap();
}

