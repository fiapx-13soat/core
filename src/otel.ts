// Bootstrap do OpenTelemetry. Importado como PRIMEIRA linha do main.ts, antes de qualquer lib
// instrumentada (pg, amqplib, ioredis, http) — o auto-instrumentation precisa aplicar patch nos
// módulos antes de eles serem carregados pela cadeia do AppModule.
//
// Liga só quando há um endpoint OTLP (bancada local exporta para o Jaeger). Sem endpoint (ex.: na
// AWS) ou em teste, fica desligado — zero overhead e nada para exportar. Métricas seguem no
// Prometheus; aqui é só tracing.
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

const enabled =
  !!process.env.OTEL_EXPORTER_OTLP_ENDPOINT &&
  process.env.OTEL_SDK_DISABLED !== 'true' &&
  process.env.NODE_ENV !== 'test';

if (enabled) {
  const sdk = new NodeSDK({
    // O exporter lê OTEL_EXPORTER_OTLP_ENDPOINT do ambiente e posta em /v1/traces.
    traceExporter: new OTLPTraceExporter(),
    instrumentations: [getNodeAutoInstrumentations()],
  });
  sdk.start();
  process.on('SIGTERM', () => {
    void sdk.shutdown();
  });
}
