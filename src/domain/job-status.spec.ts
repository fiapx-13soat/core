import { JobStatus, canTransition, isFinalStatus, allowedFrom } from './job-status';

describe('allowedFrom (origens de cada transição, coerente com canTransition)', () => {
  it.each([
    [JobStatus.QUEUED, [JobStatus.RECEIVED]],
    [JobStatus.PROCESSING, [JobStatus.QUEUED]],
    [JobStatus.COMPLETED, [JobStatus.PROCESSING]],
    [JobStatus.FAILED, [JobStatus.QUEUED, JobStatus.PROCESSING]],
    [JobStatus.CANCELLED, [JobStatus.RECEIVED, JobStatus.QUEUED, JobStatus.PROCESSING]],
    [JobStatus.EXPIRED, [JobStatus.COMPLETED]],
  ])('origens para %s', (target, expected) => {
    expect(allowedFrom(target as JobStatus).sort()).toEqual((expected as JobStatus[]).sort());
  });

  it('cada origem devolvida realmente permite a transição', () => {
    for (const target of Object.values(JobStatus)) {
      for (const from of allowedFrom(target)) {
        expect(canTransition(from, target)).toBe(true);
      }
    }
  });
});

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
