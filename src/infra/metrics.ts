import { Counter, Histogram, collectDefaultMetrics, register } from 'prom-client';

// Registro único do processo. collectDefaultMetrics é idempotente por registro,
// mas guardamos para não registrar duas vezes se este módulo for reimportado.
if (!register.getSingleMetric('process_cpu_seconds_total')) {
  collectDefaultMetrics();
}

export { register };

/** HTTP — sinal de escala do Core (CPU/requests no assignment). */
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Requisições HTTP atendidas',
  labelNames: ['method', 'route', 'status'] as const,
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duração das requisições HTTP',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
});

/** Jobs — ciclo de vida do processamento visto pelo Core. */
export const jobsCreatedTotal = new Counter({
  name: 'jobs_created_total',
  help: 'Jobs criados (upload aceito e enfileirado)',
});

export const jobsCompletedTotal = new Counter({
  name: 'jobs_completed_total',
  help: 'Jobs que chegaram a COMPLETED',
});

export const jobsFailedTotal = new Counter({
  name: 'jobs_failed_total',
  help: 'Jobs que chegaram a FAILED',
});
