export enum JobStatus {
  RECEIVED = 'RECEIVED',
  QUEUED = 'QUEUED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED'
}

const transitions: Record<JobStatus, JobStatus[]> = {
  [JobStatus.RECEIVED]: [JobStatus.QUEUED, JobStatus.CANCELLED],
  [JobStatus.QUEUED]: [JobStatus.PROCESSING, JobStatus.CANCELLED, JobStatus.FAILED],
  [JobStatus.PROCESSING]: [JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED],
  [JobStatus.COMPLETED]: [JobStatus.EXPIRED],
  [JobStatus.FAILED]: [],
  [JobStatus.CANCELLED]: [],
  [JobStatus.EXPIRED]: []
};

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return transitions[from]?.includes(to) ?? false;
}

export function isFinalStatus(status: JobStatus): boolean {
  return [JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED, JobStatus.EXPIRED].includes(status);
}

