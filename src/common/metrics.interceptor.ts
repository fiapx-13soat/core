import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';
import { finalize } from 'rxjs/operators';
import { Request, Response } from 'express';
import { httpRequestsTotal, httpRequestDuration } from '../infra/metrics';

/**
 * Registra contagem e duração de cada requisição HTTP em Prometheus.
 *
 * Usa o padrão de rota (`req.route.path`, ex.: `/api/v1/jobs/:id`) e não a URL concreta,
 * senão o cardinality explode com um label por id. Requisições sem rota casada (404) caem
 * em "unmatched".
 */
@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const endTimer = httpRequestDuration.startTimer();

    return next.handle().pipe(
      finalize(() => {
        const route = req.route?.path ?? 'unmatched';
        const labels = { method: req.method, route, status: String(res.statusCode) };
        httpRequestsTotal.inc(labels);
        endTimer(labels);
      })
    );
  }
}
