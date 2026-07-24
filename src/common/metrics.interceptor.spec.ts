import { of } from 'rxjs';
import { MetricsInterceptor } from './metrics.interceptor';
import { httpRequestsTotal } from '../infra/metrics';

const labelValue = async (labels: Record<string, string>): Promise<number> => {
  const { values } = await httpRequestsTotal.get();
  return (
    values.find((v) =>
      Object.entries(labels).every(([k, val]) => (v.labels as Record<string, unknown>)[k] === val),
    )?.value ?? 0
  );
};

describe('MetricsInterceptor', () => {
  const interceptor = new MetricsInterceptor();

  const ctx = (
    over: Partial<{ type: string; method: string; route: string; status: number }> = {},
  ) =>
    ({
      getType: () => over.type ?? 'http',
      switchToHttp: () => ({
        getRequest: () => ({
          method: over.method ?? 'GET',
          route: over.route ? { path: over.route } : undefined,
        }),
        getResponse: () => ({ statusCode: over.status ?? 200 }),
      }),
    }) as any;

  const run = (context: any) =>
    new Promise<void>((resolve) =>
      interceptor
        .intercept(context, { handle: () => of('ok') } as any)
        .subscribe({ complete: () => resolve() }),
    );

  it('conta a requisição com method/route/status como labels', async () => {
    const labels = { method: 'GET', route: '/api/v1/jobs/:id', status: '200' };
    const before = await labelValue(labels);
    await run(ctx({ method: 'GET', route: '/api/v1/jobs/:id', status: 200 }));
    expect(await labelValue(labels)).toBe(before + 1);
  });

  it('usa "unmatched" quando não há rota casada (evita cardinality por id)', async () => {
    const labels = { method: 'GET', route: 'unmatched', status: '404' };
    const before = await labelValue(labels);
    await run(ctx({ method: 'GET', route: undefined, status: 404 }));
    expect(await labelValue(labels)).toBe(before + 1);
  });

  it('ignora contexto não-http', async () => {
    // não deve lançar nem tentar ler req/res
    await expect(run(ctx({ type: 'rpc' }))).resolves.toBeUndefined();
  });
});
