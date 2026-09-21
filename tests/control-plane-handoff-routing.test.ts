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
  OutboxConsumerRegistry,
} from '@/lib/control-plane/consumer';

import {
  GovernedHandoffRouterConsumer,
} from '@/lib/control-plane/handoff-router';

import {
  ReliableOutboxWorker,
} from '@/lib/control-plane/outbox-worker';

import {
  SqliteGovernedHandoffStore,
} from '@/lib/control-plane/sqlite-handoff-store';

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
      'startup-handoff-routing-',
    ),
  );

  return new SqliteGovernedHandoffStore(
    path.join(
      tempDir,
      'cp.db',
    ),
  );
}

const retryPolicy = {
  maxAttempts: 5,
  initialDelayMs: 1_000,
  backoffMultiplier: 2,
  maxDelayMs: 60_000,
  timeoutMs: 30_000,
};

describe('Governed handoff routing consumer', () => {
  test('turns one transition event into durable agent handoffs idempotently', async () => {
    const cp = store();

    await cp.createWorkflow({
      id: 'wf-1',
      state: 'RISK_ANALYSIS',
      revision: 1,
      createdBy: {
        kind: 'agent',
        id: 'lauti',
      },
      createdAt:
        '2026-01-01T00:00:00.000Z',
      updatedAt:
        '2026-01-01T00:01:00.000Z',
      artifacts: [],
      invalidations: [],
      metadata: {},
    });

    cp.enqueueOutbox({
      messageId: 'msg-risk',
      topic:
        'control-plane.workflow.transitioned',
      partitionKey: 'wf-1',
      workflowId: 'wf-1',
      createdAt:
        '2026-01-01T00:01:00.000Z',
      availableAt:
        '2026-01-01T00:01:00.000Z',
      retryPolicy,
      payload: {
        eventId: 'event-risk',
        eventType:
          'workflow_transitioned',
        fromState:
          'CEO_RESEARCH_APPROVED',
        toState:
          'RISK_ANALYSIS',
      },
    });

    const registry =
      new OutboxConsumerRegistry();

    registry.register(
      new GovernedHandoffRouterConsumer(
        cp,
      ),
    );

    const worker =
      new ReliableOutboxWorker(
        cp,
        registry,
        {
          workerId:
            'handoff-router-worker',
          batchSize: 10,
          outboxLeaseMs: 10_000,
          consumerLeaseMs: 10_000,
        },
      );

    const first =
      await worker.runOnce(
        '2026-01-01T00:01:01.000Z',
      );

    expect(first.succeeded).toBe(1);

    expect(
      cp.listHandoffs({
        workflowId: 'wf-1',
      }).map(
        (handoff) =>
          handoff.destination.id,
      ),
    ).toEqual([
      'manuel',
      'dimash',
      'bare',
      'angelo',
    ]);

    /*
     * Re-plan the same source message directly. Deterministic handoff
     * IDs + INSERT OR IGNORE must keep exactly four rows.
     */
    const router =
      new GovernedHandoffRouterConsumer(
        cp,
      );

    await router.handle({
      message:
        cp.listOutbox()[0],
      idempotencyKey:
        'manual-replay',
      deliveryAttempt: 2,
    });

    expect(
      cp.listHandoffs({
        workflowId: 'wf-1',
      }),
    ).toHaveLength(4);

    cp.close();
  });
});
