import {
  afterEach,
  describe,
  expect,
  test,
} from 'vitest';

import {
  mkdtempSync,
  rmSync,
} from 'node:fs';

import {
  tmpdir,
} from 'node:os';

import path from 'node:path';

import {
  SqliteControlPlaneStore,
} from '@/lib/control-plane/sqlite-store';

let tempDir: string | null = null;

afterEach(() => {
  if (tempDir) {
    rmSync(
      tempDir,
      {
        recursive: true,
        force: true,
      },
    );

    tempDir = null;
  }
});

function store() {
  tempDir = mkdtempSync(
    path.join(
      tmpdir(),
      'startup-jobs-',
    ),
  );

  return new SqliteControlPlaneStore(
    path.join(
      tempDir,
      'cp.db',
    ),
  );
}

const retryPolicy = {
  maxAttempts: 2,
  initialDelayMs: 1_000,
  backoffMultiplier: 2,
  maxDelayMs: 10_000,
  timeoutMs: 30_000,
};

describe('Control Plane durable jobs', () => {
  test('claims a due job with a lease and prevents concurrent claim', () => {
    const cp = store();

    cp.scheduleJob({
      jobId: 'job-1',
      workflowId: 'wf-1',
      kind:
        'monitor_position',
      runAt:
        '2026-01-01T00:00:00.000Z',
      createdAt:
        '2026-01-01T00:00:00.000Z',
      retryPolicy,
      payload: {},
    });

    const a =
      cp.claimDueJobs({
        workerId: 'worker-a',
        now:
          '2026-01-01T00:00:01.000Z',
        limit: 10,
        leaseMs: 60_000,
      });

    const b =
      cp.claimDueJobs({
        workerId: 'worker-b',
        now:
          '2026-01-01T00:00:02.000Z',
        limit: 10,
        leaseMs: 60_000,
      });

    expect(a).toHaveLength(1);
    expect(b).toHaveLength(0);

    cp.completeJob({
      jobId: 'job-1',
      workerId: 'worker-a',
      completedAt:
        '2026-01-01T00:00:03.000Z',
    });

    expect(
      cp.listJobs()[0],
    ).toMatchObject({
      status: 'succeeded',
      attempts: 1,
    });

    cp.close();
  });

  test('retries failed durable jobs and dead-letters exhausted jobs', () => {
    const cp = store();

    cp.scheduleJob({
      jobId: 'job-2',
      kind:
        'refresh-material-event',
      runAt:
        '2026-01-01T00:00:00.000Z',
      createdAt:
        '2026-01-01T00:00:00.000Z',
      retryPolicy,
      payload: {},
    });

    cp.claimDueJobs({
      workerId: 'worker-a',
      now:
        '2026-01-01T00:00:01.000Z',
      limit: 1,
      leaseMs: 10_000,
    });

    const retry =
      cp.failJob({
        jobId: 'job-2',
        workerId: 'worker-a',
        failedAt:
          '2026-01-01T00:00:02.000Z',
        error: 'temporary',
      });

    expect(retry.status).toBe(
      'scheduled',
    );

    expect(retry.runAt).toBe(
      '2026-01-01T00:00:03.000Z',
    );

    cp.claimDueJobs({
      workerId: 'worker-b',
      now:
        '2026-01-01T00:00:03.000Z',
      limit: 1,
      leaseMs: 10_000,
    });

    const dead =
      cp.failJob({
        jobId: 'job-2',
        workerId: 'worker-b',
        failedAt:
          '2026-01-01T00:00:04.000Z',
        error: 'permanent',
      });

    expect(dead.status).toBe(
      'dead_letter',
    );

    cp.close();
  });
});
