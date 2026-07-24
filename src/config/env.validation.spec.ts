import { validateEnv } from './env.validation';

const complete = {
  DATABASE_URL: 'postgres://x',
  AMQP_URL: 'amqp://x',
  S3_BUCKET_VIDEOS: 'v',
  S3_BUCKET_ARCHIVES: 'a',
  JWT_SECRET: 's3cr3t',
};

describe('validateEnv', () => {
  it('passa quando as obrigatórias estão presentes', () => {
    expect(() => validateEnv(complete)).not.toThrow();
  });

  it.each(['DATABASE_URL', 'AMQP_URL', 'S3_BUCKET_VIDEOS', 'S3_BUCKET_ARCHIVES', 'JWT_SECRET'])(
    'falha se %s faltar',
    (missing) => {
      const config = { ...complete, [missing]: '' };
      expect(() => validateEnv(config)).toThrow(new RegExp(missing));
    },
  );

  it('rejeita PORT fora de faixa', () => {
    expect(() => validateEnv({ ...complete, PORT: 70000 })).toThrow(/PORT/);
  });
});
