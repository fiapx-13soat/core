import { AsyncLocalStorage } from 'async_hooks';

interface CorrelationStore {
  correlationId?: string;
}

// Carrega o correlationId pela cadeia async da requisição/consumo sem precisar
// passá-lo de mão em mão até o ponto de log. O Logger do Nest não é request-scoped,
// então este ALS é o que permite CA-C12 (correlationId em todo log).
const storage = new AsyncLocalStorage<CorrelationStore>();

/** Executa `fn` num escopo onde `getCorrelationId()` devolve este id. */
export function runWithCorrelation<T>(correlationId: string | undefined, fn: () => T): T {
  return storage.run({ correlationId }, fn);
}

export function getCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}
