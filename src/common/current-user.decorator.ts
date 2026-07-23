import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { RequestWithContext } from './correlation.middleware';

export function currentUserId(req: Pick<RequestWithContext, 'user'>): string {
  return req.user?.sub ?? '';
}

export function correlationId(req: Pick<RequestWithContext, 'correlationId'>): string {
  return req.correlationId;
}

export function currentUserIdFactory(_data: unknown, ctx: ExecutionContext): string {
  const req = ctx.switchToHttp().getRequest<RequestWithContext>();
  return currentUserId(req);
}

export const CurrentUserId = createParamDecorator(currentUserIdFactory);

export function correlationIdFactory(_data: unknown, ctx: ExecutionContext): string {
  const req = ctx.switchToHttp().getRequest<RequestWithContext>();
  return correlationId(req);
}

export const CorrelationId = createParamDecorator(correlationIdFactory);
