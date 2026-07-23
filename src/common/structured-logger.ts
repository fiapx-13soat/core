import { LoggerService } from '@nestjs/common';
import { getCorrelationId } from './correlation-context';

type Level = 'log' | 'error' | 'warn' | 'debug' | 'verbose';

/**
 * Logger JSON estruturado (CA-C12 / §4). Emite uma linha JSON por evento, com o
 * `correlationId` do escopo corrente (via AsyncLocalStorage) — vale tanto para logs de
 * requisição HTTP quanto de consumo de mensagem.
 *
 * Registrado via `app.useLogger`, então todo `new Logger(ctx)` do Nest passa por aqui.
 * Aceita mensagem string ou objeto (`logger.warn({ message, jobId, ... })`), fundindo os
 * campos do objeto na linha — mesmo espírito do createStructuredLog do fiapx-notification.
 */
export class StructuredLogger implements LoggerService {
  log(message: unknown, ...params: unknown[]): void {
    this.write('log', message, params);
  }

  error(message: unknown, ...params: unknown[]): void {
    // Nest chama error(message, stack?, context?)
    const [stack, context] = this.splitError(params);
    this.emit('error', message, context, stack);
  }

  warn(message: unknown, ...params: unknown[]): void {
    this.write('warn', message, params);
  }

  debug(message: unknown, ...params: unknown[]): void {
    this.write('debug', message, params);
  }

  verbose(message: unknown, ...params: unknown[]): void {
    this.write('verbose', message, params);
  }

  private write(level: Level, message: unknown, params: unknown[]): void {
    const context = typeof params[params.length - 1] === 'string' ? (params[params.length - 1] as string) : undefined;
    this.emit(level, message, context);
  }

  private splitError(params: unknown[]): [string | undefined, string | undefined] {
    const strings = params.filter((p) => typeof p === 'string') as string[];
    if (strings.length >= 2) return [strings[0], strings[1]]; // stack, context
    if (strings.length === 1) return [strings[0].includes('\n') ? strings[0] : undefined, strings[0]];
    return [undefined, undefined];
  }

  private emit(level: Level, message: unknown, context?: string, stack?: string): void {
    const entry: Record<string, unknown> = {
      level,
      time: new Date().toISOString(),
      context,
      correlationId: getCorrelationId()
    };

    if (message !== null && typeof message === 'object') {
      Object.assign(entry, message); // funde campos estruturados
      entry.message = (message as { message?: unknown }).message ?? entry.message;
    } else {
      entry.message = message;
    }
    if (stack) entry.stack = stack;

    process.stdout.write(`${JSON.stringify(entry)}\n`);
  }
}
