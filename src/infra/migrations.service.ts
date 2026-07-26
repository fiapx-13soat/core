import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Aplica o schema do próprio serviço no boot (self-migration): cada serviço é dono das suas
 * tabelas. O infra só provisiona o banco vazio e a role — aqui criamos o schema dentro dele.
 *
 * As migrations em `migrations/*.sql` são idempotentes (`create ... if not exists`), então
 * reaplicar a cada boot é seguro e dispensa uma tabela de controle. Um advisory lock serializa
 * réplicas subindo ao mesmo tempo. Não roda em teste: a suíte de integração monta o próprio schema.
 */
@Injectable()
export class MigrationsService implements OnModuleInit {
  private readonly logger = new Logger(MigrationsService.name);
  // Chave arbitrária e estável do advisory lock — só precisa ser a mesma entre réplicas.
  private static readonly LOCK_KEY = 4713;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    const pool = new Pool({ connectionString: this.config.get<string>('app.databaseUrl') });
    try {
      const files = this.migrationFiles();
      await pool.query('select pg_advisory_lock($1)', [MigrationsService.LOCK_KEY]);
      try {
        for (const file of files) {
          const sql = readFileSync(file, 'utf8');
          await pool.query('begin');
          try {
            await pool.query(sql);
            await pool.query('commit');
          } catch (error) {
            await pool.query('rollback');
            throw error;
          }
        }
      } finally {
        await pool.query('select pg_advisory_unlock($1)', [MigrationsService.LOCK_KEY]);
      }
      this.logger.log(`Schema aplicado (${files.length} migration(s))`);
    } finally {
      await pool.end();
    }
  }

  private migrationFiles(): string[] {
    const dir = join(process.cwd(), 'migrations');
    return readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .map((f) => join(dir, f));
  }
}
