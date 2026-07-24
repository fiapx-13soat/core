import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { runWithCorrelation } from './correlation-context';

export interface RequestWithContext extends Request {
  correlationId: string;
  user?: { sub: string };
}

@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  use(req: RequestWithContext, res: Response, next: NextFunction): void {
    const incoming = req.header('x-correlation-id');
    const correlationId = incoming && incoming.length > 0 ? incoming : randomUUID();
    req.correlationId = correlationId;
    res.setHeader('X-Correlation-Id', correlationId);
    // roda o resto da requisição no escopo do ALS para os logs carregarem o id
    runWithCorrelation(correlationId, () => next());
  }
}
