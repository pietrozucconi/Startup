import {
  describe,
  expect,
  test,
} from 'vitest';

import {
  canRetryJob,
  computeRetryDelayMs,
  isJobTimedOut,
  nextRetryAt,
  type ScheduledJob,
} from '@/lib/control-plane/jobs';

const policy = {
  maxAttempts: 4,
  initialDelayMs: 1_000,
  backoffMultiplier: 2,
  maxDelayMs: 5_000,
  timeoutMs: 10_000,
};

describe('Control Plane scheduling helpers', () => {
  test('calculates bounded exponential retry delay', () => {
    expect(
      computeRetryDelayMs(policy, 1),
    ).toBe(1_000);

    expect(
      computeRetryDelayMs(policy, 2),
    ).toBe(2_000);

    expect(
      computeRetryDelayMs(policy, 4),
    ).toBe(5_000);
  });

  test('detects timeout without inventing business risk limits', () => {
    const job: ScheduledJob = {
      id: 'job-1',
      kind: 'monitoring-check',
      runAt:
        '2026-01-01T00:00:00.000Z',
      status: 'running',
      attempts: 1,
      startedAt:
        '2026-01-01T00:00:00.000Z',
      retryPolicy: policy,
      metadata: {},
    };

    expect(
      isJobTimedOut(
        job,
        '2026-01-01T00:00:11.000Z',
      ),
    ).toBe(true);
  });

  test('allows retries only within technical retry policy', () => {
    const job: ScheduledJob = {
      id: 'job-2',
      kind: 'retry-example',
      runAt:
        '2026-01-01T00:00:00.000Z',
      status: 'failed',
      attempts: 2,
      retryPolicy: policy,
      metadata: {},
    };

    expect(canRetryJob(job)).toBe(true);

    expect(
      nextRetryAt(
        job,
        '2026-01-01T00:00:00.000Z',
      ),
    ).toBe(
      '2026-01-01T00:00:02.000Z',
    );
  });
});
