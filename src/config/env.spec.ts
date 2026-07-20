import envConfig from './env';

describe('env config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.PORT;
    delete process.env.DATABASE_URL;
    delete process.env.AMQP_URL;
    delete process.env.REDIS_URL;
    delete process.env.AWS_REGION;
    delete process.env.AWS_ENDPOINT_URL;
    delete process.env.S3_BUCKET_VIDEOS;
    delete process.env.S3_BUCKET_ARCHIVES;
    delete process.env.S3_PUBLIC_ENDPOINT;
    delete process.env.JWT_SECRET;
    delete process.env.ACCESS_TOKEN_TTL_MINUTES;
    delete process.env.REFRESH_TOKEN_TTL_DAYS;
    delete process.env.UPLOAD_MAX_BYTES;
    delete process.env.UPLOAD_RATE_LIMIT_PER_MIN;
    delete process.env.UPLOAD_RATE_LIMIT_BURST;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns defaults from factory', () => {
    const cfg = envConfig();
    expect(cfg.port).toBe(8080);
    expect(cfg.awsRegion).toBe('us-east-1');
    expect(cfg.jwtSecret).toBe('change-me');
    expect(cfg.accessTokenTtlMinutes).toBe(15);
    expect(cfg.refreshTokenTtlDays).toBe(7);
  });

  it('reads explicit env vars', () => {
    process.env.PORT = '3001';
    process.env.DATABASE_URL = 'postgres://db';
    process.env.AMQP_URL = 'amqp://rabbit';
    process.env.S3_BUCKET_VIDEOS = 'videos';
    process.env.S3_BUCKET_ARCHIVES = 'archives';
    const cfg = envConfig();
    expect(cfg.port).toBe(3001);
    expect(cfg.databaseUrl).toBe('postgres://db');
    expect(cfg.amqpUrl).toBe('amqp://rabbit');
    expect(cfg.s3BucketVideos).toBe('videos');
    expect(cfg.s3BucketArchives).toBe('archives');
  });
});

