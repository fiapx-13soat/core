import { JobStatus, canTransition, isFinalStatus } from './job-status';

describe('job status transitions', () => {
  it('accepts valid transitions', () => {
    expect(canTransition(JobStatus.RECEIVED, JobStatus.QUEUED)).toBe(true);
    expect(canTransition(JobStatus.RECEIVED, JobStatus.CANCELLED)).toBe(true);
    expect(canTransition(JobStatus.QUEUED, JobStatus.PROCESSING)).toBe(true);
    expect(canTransition(JobStatus.QUEUED, JobStatus.CANCELLED)).toBe(true);
    expect(canTransition(JobStatus.QUEUED, JobStatus.FAILED)).toBe(true);
    expect(canTransition(JobStatus.PROCESSING, JobStatus.COMPLETED)).toBe(true);
    expect(canTransition(JobStatus.PROCESSING, JobStatus.COMPLETED)).toBe(true);
    expect(canTransition(JobStatus.PROCESSING, JobStatus.FAILED)).toBe(true);
    expect(canTransition(JobStatus.PROCESSING, JobStatus.CANCELLED)).toBe(true);
    expect(canTransition(JobStatus.COMPLETED, JobStatus.EXPIRED)).toBe(true);
  });

  it('rejects invalid transitions', () => {
    expect(canTransition(JobStatus.RECEIVED, JobStatus.COMPLETED)).toBe(false);
    expect(canTransition(JobStatus.FAILED, JobStatus.PROCESSING)).toBe(false);
    expect(canTransition(JobStatus.COMPLETED, JobStatus.PROCESSING)).toBe(false);
    expect(canTransition(JobStatus.CANCELLED, JobStatus.QUEUED)).toBe(false);
    expect(canTransition(JobStatus.QUEUED, JobStatus.QUEUED)).toBe(false);
  });

  it('marks final statuses', () => {
    expect(isFinalStatus(JobStatus.COMPLETED)).toBe(true);
    expect(isFinalStatus(JobStatus.FAILED)).toBe(true);
    expect(isFinalStatus(JobStatus.CANCELLED)).toBe(true);
    expect(isFinalStatus(JobStatus.EXPIRED)).toBe(true);
    expect(isFinalStatus(JobStatus.QUEUED)).toBe(false);
    expect(isFinalStatus(JobStatus.RECEIVED)).toBe(false);
  });
});

