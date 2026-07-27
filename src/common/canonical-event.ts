import { trace } from '@opentelemetry/api';
import { getCorrelationId, getEventFields } from './correlation-context';

/**
 * Emite UM evento canônico (wide event) — uma linha JSON rica com o contexto acumulado do escopo
 * (correlationId, traceId, campos de negócio) mais os `fields` do ponto de emissão. É o registro
 * primário de uma requisição HTTP ou de um consumo de mensagem, no espírito do loggingsucks.com:
 * em vez de logs espalhados, um evento denso por unidade de trabalho.
 */
export function emitCanonicalEvent(fields: Record<string, unknown>): void {
  const entry = {
    time: new Date().toISOString(),
    correlationId: getCorrelationId(),
    traceId: trace.getActiveSpan()?.spanContext().traceId,
    ...getEventFields(),
    ...fields,
  };
  process.stdout.write(`${JSON.stringify(entry)}\n`);
}
