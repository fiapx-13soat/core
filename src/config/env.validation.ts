import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, Min, validateSync } from 'class-validator';

/**
 * Valida as env vars no boot (fail fast). As obrigatórias precisam estar presentes — sem elas o
 * core assinaria JWT com segredo público, conectaria em banco/broker vazio, etc. As opcionais
 * têm default aplicado em config/env.ts; aqui só garantimos o tipo quando presentes.
 */
class EnvironmentVariables {
  @IsNotEmpty()
  @IsString()
  DATABASE_URL!: string;

  @IsNotEmpty()
  @IsString()
  AMQP_URL!: string;

  @IsNotEmpty()
  @IsString()
  S3_BUCKET_VIDEOS!: string;

  @IsNotEmpty()
  @IsString()
  S3_BUCKET_ARCHIVES!: string;

  @IsNotEmpty()
  @IsString()
  JWT_SECRET!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT?: number;
}

export function validateEnv(config: Record<string, unknown>): Record<string, unknown> {
  const validated = plainToInstance(EnvironmentVariables, config, { enableImplicitConversion: true });
  const errors = validateSync(validated, { skipMissingProperties: false, whitelist: false });
  if (errors.length > 0) {
    const detail = errors.map((e) => `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`).join('; ');
    throw new Error(`Configuração inválida — verifique as env vars: ${detail}`);
  }
  return config;
}
