import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { emitCanonicalEvent } from './canonical-event';

interface AuthedRequest extends Request {
  user?: { sub?: string };
}

/**
 * Emite um evento canônico por requisição HTTP: `event=http_request` com método, rota (padrão, não
 * a URL concreta — senão a cardinalidade explode), status, duração, desfecho, userId e o que os
 * handlers tiverem enriquecido (jobId, sizeBytes, ...). Registrado como interceptor global.
 */
@Injectable()
export class CanonicalEventInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const req = http.getRequest<AuthedRequest>();
    const res = http.getResponse<Response>();
    const start = Date.now();

    const emit = (outcome: 'ok' | 'error', status: number, errorCode?: string): void => {
      emitCanonicalEvent({
        event: 'http_request',
        method: req.method,
        route: req.route?.path ?? 'unmatched',
        status,
        durationMs: Date.now() - start,
        outcome,
        errorCode,
        userId: req.user?.sub,
      });
    };

    return next.handle().pipe(
      tap({
        next: () => emit('ok', res.statusCode),
        error: (err: { status?: number; getStatus?: () => number; name?: string }) => {
          const status =
            typeof err.getStatus === 'function' ? err.getStatus() : (err.status ?? 500);
          emit('error', status, err.name);
        },
      }),
    );
  }
}
