import { CorrelationMiddleware } from './correlation.middleware';

describe('CorrelationMiddleware', () => {
  it('uses incoming correlation id', () => {
    const middleware = new CorrelationMiddleware();
    const req: any = { header: (name: string) => (name === 'x-correlation-id' ? 'cid-1' : undefined) };
    const res: any = { setHeader: jest.fn() };
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(req.correlationId).toBe('cid-1');
    expect(res.setHeader).toHaveBeenCalledWith('X-Correlation-Id', 'cid-1');
    expect(next).toHaveBeenCalled();
  });

  it('generates id when missing', () => {
    const middleware = new CorrelationMiddleware();
    const req: any = { header: () => undefined };
    const res: any = { setHeader: jest.fn() };
    const next = jest.fn();

    middleware.use(req, res, next);

    expect(typeof req.correlationId).toBe('string');
    expect(req.correlationId.length).toBeGreaterThan(0);
  });
});

