// Env mínima para os testes que importam o AppModule: a validação de config (validateEnv)
// roda no boot e falharia sem as obrigatórias. Valores dummy — nenhum teste unitário conecta
// de verdade (usam mocks). Não sobrescreve o que já estiver setado (CI/integração).
process.env.DATABASE_URL ??= 'postgres://test';
process.env.AMQP_URL ??= 'amqp://test';
process.env.S3_BUCKET_VIDEOS ??= 'test-videos';
process.env.S3_BUCKET_ARCHIVES ??= 'test-archives';
process.env.JWT_SECRET ??= 'test-secret';
