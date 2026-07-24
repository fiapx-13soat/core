export enum JobStatus {
  RECEIVED = 'RECEIVED',
  QUEUED = 'QUEUED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
}

const transitions: Record<JobStatus, JobStatus[]> = {
  [JobStatus.RECEIVED]: [JobStatus.QUEUED, JobStatus.CANCELLED],
  [JobStatus.QUEUED]: [JobStatus.PROCESSING, JobStatus.CANCELLED, JobStatus.FAILED],
  [JobStatus.PROCESSING]: [JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED],
  [JobStatus.COMPLETED]: [JobStatus.EXPIRED],
  [JobStatus.FAILED]: [],
  [JobStatus.CANCELLED]: [],
  [JobStatus.EXPIRED]: [],
};

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return transitions[from]?.includes(to) ?? false;
}

/**
 * Estados de origem a partir dos quais `target` é alcançável — derivado da mesma tabela.
 * É o que o UPDATE condicional (setJobStatus) usa como filtro de `from`, tornando a máquina
 * de estados a fonte única em vez de arrays repetidos nos serviços.
 */
export function allowedFrom(target: JobStatus): JobStatus[] {
  return (Object.keys(transitions) as JobStatus[]).filter((from) =>
    transitions[from].includes(target),
  );
}

export function isFinalStatus(status: JobStatus): boolean {
  return [JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED, JobStatus.EXPIRED].includes(
    status,
  );
}
