import { AsyncLocalStorage } from 'async_hooks';

interface CorrelationStore {
  correlationId?: string;
  // Bag do "wide event": handlers enriquecem ao longo da requisição/consumo e um único evento
  // canônico é emitido ao final com todos esses campos (estilo loggingsucks.com — um evento
  // rico por request/consumo, não log espalhado).
  event: Record<string, unknown>;
}

// Carrega o correlationId pela cadeia async da requisição/consumo sem precisar
// passá-lo de mão em mão até o ponto de log. O Logger do Nest não é request-scoped,
// então este ALS é o que permite CA-C12 (correlationId em todo log).
const storage = new AsyncLocalStorage<CorrelationStore>();

/** Executa `fn` num escopo onde `getCorrelationId()` devolve este id. */
export function runWithCorrelation<T>(correlationId: string | undefined, fn: () => T): T {
  return storage.run({ correlationId, event: {} }, fn);
}

export function getCorrelationId(): string | undefined {
  return storage.getStore()?.correlationId;
}

/** Enriquece o evento canônico do escopo atual (no-op fora de um escopo). */
export function addEventFields(fields: Record<string, unknown>): void {
  const store = storage.getStore();
  if (store) {
    Object.assign(store.event, fields);
  }
}

/** Campos de negócio acumulados no evento canônico do escopo atual. */
export function getEventFields(): Record<string, unknown> {
  return storage.getStore()?.event ?? {};
}
