import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  port: Number(process.env.PORT ?? '8080'),
  databaseUrl: process.env.DATABASE_URL ?? '',
  amqpUrl: process.env.AMQP_URL ?? '',
  redisUrl: process.env.REDIS_URL ?? '',
  awsRegion: process.env.AWS_REGION ?? 'us-east-1',
  awsEndpointUrl: process.env.AWS_ENDPOINT_URL ?? '',
  s3BucketVideos: process.env.S3_BUCKET_VIDEOS ?? '',
  s3BucketArchives: process.env.S3_BUCKET_ARCHIVES ?? '',
  s3PublicEndpoint: process.env.S3_PUBLIC_ENDPOINT ?? '',
  // sem default: validateEnv falha o boot se JWT_SECRET não vier (evita segredo público)
  jwtSecret: process.env.JWT_SECRET ?? '',
  accessTokenTtlMinutes: Number(process.env.ACCESS_TOKEN_TTL_MINUTES ?? '15'),
  refreshTokenTtlDays: Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? '7'),
  uploadMaxBytes: Number(process.env.UPLOAD_MAX_BYTES ?? `${500 * 1024 * 1024}`),
  uploadRateLimitPerMinute: Number(process.env.UPLOAD_RATE_LIMIT_PER_MIN ?? '20'),
  uploadRateLimitBurst: Number(process.env.UPLOAD_RATE_LIMIT_BURST ?? '5')
}));

