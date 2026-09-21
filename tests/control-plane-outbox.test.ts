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
      'startup-outbox-',
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

describe('Control Plane durable outbox', () => {
  test('leases messages to one worker and publishes them exactly once at store level', () => {
    const cp = store();

    cp.enqueueOutbox({
      messageId: 'msg-1',
      topic:
        'workflow.transitioned',
      partitionKey: 'wf-1',
      workflowId: 'wf-1',
      createdAt:
        '2026-01-01T00:00:00.000Z',
      availableAt:
        '2026-01-01T00:00:00.000Z',
      retryPolicy,
      payload: {
        state: 'RESEARCHING',
      },
    });

    const workerA =
      cp.claimOutbox({
        workerId: 'worker-a',
        now:
          '2026-01-01T00:00:01.000Z',
        limit: 10,
        leaseMs: 60_000,
      });

    const workerB =
      cp.claimOutbox({
        workerId: 'worker-b',
        now:
          '2026-01-01T00:00:02.000Z',
        limit: 10,
        leaseMs: 60_000,
      });

    expect(workerA).toHaveLength(1);
    expect(workerB).toHaveLength(0);

    cp.acknowledgeOutbox({
      messageId: 'msg-1',
      workerId: 'worker-a',
      publishedAt:
        '2026-01-01T00:00:03.000Z',
    });

    expect(
      cp.listOutbox()[0],
    ).toMatchObject({
      status: 'published',
      attempts: 1,
    });

    cp.close();
  });

  test('retries failures then moves exhausted message to dead letter', () => {
    const cp = store();

    cp.enqueueOutbox({
      messageId: 'msg-2',
      topic:
        'brain.memory.proposed',
      partitionKey: 'wf-2',
      createdAt:
        '2026-01-01T00:00:00.000Z',
      availableAt:
        '2026-01-01T00:00:00.000Z',
      retryPolicy,
      payload: {},
    });

    cp.claimOutbox({
      workerId: 'worker-a',
      now:
        '2026-01-01T00:00:01.000Z',
      limit: 1,
      leaseMs: 10_000,
    });

    const retry =
      cp.failOutbox({
        messageId: 'msg-2',
        workerId: 'worker-a',
        failedAt:
          '2026-01-01T00:00:02.000Z',
        error: 'temporary',
      });

    expect(retry.status).toBe(
      'pending',
    );

    expect(retry.availableAt).toBe(
      '2026-01-01T00:00:03.000Z',
    );

    cp.claimOutbox({
      workerId: 'worker-b',
      now:
        '2026-01-01T00:00:03.000Z',
      limit: 1,
      leaseMs: 10_000,
    });

    const dead =
      cp.failOutbox({
        messageId: 'msg-2',
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
