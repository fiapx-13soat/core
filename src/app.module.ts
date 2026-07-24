import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import envConfig from './config/env';
import { validateEnv } from './config/env.validation';
import { CorrelationMiddleware } from './common/correlation.middleware';
import { MetricsInterceptor } from './common/metrics.interceptor';
import { UploadRateLimitGuard } from './common/upload-rate-limit.guard';
import { JwtStrategy } from './auth/jwt.strategy';
import { DatabaseService } from './infra/database.service';
import { CacheService } from './infra/cache.service';
import { S3Service } from './infra/s3.service';
import { RabbitMQService } from './infra/rabbitmq.service';
import { AuthService } from './application/auth.service';
import { UsersService } from './application/users.service';
import { JobsService } from './application/jobs.service';
import { ResultsConsumerService } from './application/results-consumer.service';
import { UsersController } from './interfaces/users.controller';
import { AuthController } from './interfaces/auth.controller';
import { VideosController } from './interfaces/videos.controller';
import { JobsController } from './interfaces/jobs.controller';
import { InternalController } from './interfaces/internal.controller';
import { HealthController } from './interfaces/health.controller';
import { MetricsController } from './interfaces/metrics.controller';

export function jwtOptionsFactory(config: ConfigService) {
  return {
    secret: config.get<string>('app.jwtSecret'),
  };
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [envConfig], validate: validateEnv }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: jwtOptionsFactory,
    }),
  ],
  controllers: [
    HealthController,
    MetricsController,
    UsersController,
    AuthController,
    VideosController,
    JobsController,
    InternalController,
  ],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
    UploadRateLimitGuard,
    JwtStrategy,
    DatabaseService,
    CacheService,
    S3Service,
    RabbitMQService,
    AuthService,
    UsersService,
    JobsService,
    ResultsConsumerService,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationMiddleware).forRoutes('*');
  }
}
