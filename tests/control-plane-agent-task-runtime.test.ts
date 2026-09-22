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
  SqliteInternalRuntimeStore,
} from '@/lib/control-plane/sqlite-runtime-store';

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
      'startup-agent-runtime-',
    ),
  );

  return new SqliteInternalRuntimeStore(
    path.join(
      tempDir,
      'cp.db',
    ),
  );
}

describe('Agent runtime queue', () => {
  test('leases tasks to the assigned agent and completes them', () => {
    const cp = store();

    cp.upsertAgentRuntimeTask({
      taskId: 'task-1',
      handoffId: 'handoff-1',
      workflowId: 'wf-1',
      agentId: 'manuel',
      action:
        'analyze_portfolio_risk',
      summary:
        'Analyze portfolio risk.',
      stateAtAssignment:
        'RISK_ANALYSIS',
      priority: 'normal',
      createdAt:
        '2026-01-01T00:00:00.000Z',
      availableAt:
        '2026-01-01T00:00:00.000Z',
      updatedAt:
        '2026-01-01T00:00:00.000Z',
      retryPolicy: {
        maxAttempts: 2,
        initialDelayMs: 1_000,
        backoffMultiplier: 2,
        maxDelayMs: 10_000,
        timeoutMs: 30_000,
      },
      payload: {},
      policyEvidence: [],
    });

    const manuel =
      cp.claimAgentRuntimeTasks({
        agentId: 'manuel',
        workerId: 'manuel-worker',
        now:
          '2026-01-01T00:00:01.000Z',
        limit: 10,
        leaseMs: 10_000,
      });

    const dimash =
      cp.claimAgentRuntimeTasks({
        agentId: 'dimash',
        workerId: 'dimash-worker',
        now:
          '2026-01-01T00:00:01.000Z',
        limit: 10,
        leaseMs: 10_000,
      });

    expect(manuel).toHaveLength(1);
    expect(dimash).toHaveLength(0);

    cp.completeAgentRuntimeTask({
      taskId: 'task-1',
      workerId: 'manuel-worker',
      completedAt:
        '2026-01-01T00:00:02.000Z',
      result: {
        artifactSubmissionRequired:
          true,
      },
    });

    expect(
      cp.listAgentRuntimeTasks()[0],
    ).toMatchObject({
      status: 'completed',
      attempts: 1,
      result: {
        artifactSubmissionRequired:
          true,
      },
    });

    cp.close();
  });

  test('requeues failures then dead-letters exhausted agent tasks', () => {
    const cp = store();

    cp.upsertAgentRuntimeTask({
      taskId: 'task-2',
      handoffId: 'handoff-2',
      agentId: 'john',
      action:
        'monitor_open_position',
      summary:
        'Monitor open position.',
      priority: 'normal',
      createdAt:
        '2026-01-01T00:00:00.000Z',
      availableAt:
        '2026-01-01T00:00:00.000Z',
      updatedAt:
        '2026-01-01T00:00:00.000Z',
      retryPolicy: {
        maxAttempts: 2,
        initialDelayMs: 1_000,
        backoffMultiplier: 2,
        maxDelayMs: 10_000,
        timeoutMs: 30_000,
      },
      payload: {},
      policyEvidence: [],
    });

    cp.claimAgentRuntimeTasks({
      agentId: 'john',
      workerId: 'john-worker-a',
      now:
        '2026-01-01T00:00:01.000Z',
      limit: 1,
      leaseMs: 10_000,
    });

    const retry =
      cp.failAgentRuntimeTask({
        taskId: 'task-2',
        workerId: 'john-worker-a',
        failedAt:
          '2026-01-01T00:00:02.000Z',
        error:
          'temporary_model_error',
      });

    expect(retry.status).toBe(
      'queued',
    );

    cp.claimAgentRuntimeTasks({
      agentId: 'john',
      workerId: 'john-worker-b',
      now:
        '2026-01-01T00:00:03.000Z',
      limit: 1,
      leaseMs: 10_000,
    });

    const dead =
      cp.failAgentRuntimeTask({
        taskId: 'task-2',
        workerId: 'john-worker-b',
        failedAt:
          '2026-01-01T00:00:04.000Z',
        error:
          'permanent_model_error',
      });

    expect(dead.status).toBe(
      'dead_letter',
    );

    cp.close();
  });
});
