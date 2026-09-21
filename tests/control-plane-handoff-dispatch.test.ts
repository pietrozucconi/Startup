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
  GovernedHandoffDispatcher,
  GovernedHandoffSinkRegistry,
} from '@/lib/control-plane/handoff-dispatcher';

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
      'startup-handoff-dispatch-',
    ),
  );

  return new SqliteGovernedHandoffStore(
    path.join(
      tempDir,
      'cp.db',
    ),
  );
}

describe('Governed handoff dispatcher', () => {
  test('delivers to the exact registered destination with stable idempotency key', async () => {
    const cp = store();

    cp.enqueueHandoffsIdempotent([
      {
        handoffId:
          'handoff:msg-1:agent:yann:perform_red_desk_review',
        sourceMessageId: 'msg-1',
        sourceTopic:
          'control-plane.workflow.transitioned',
        workflowId: 'wf-1',
        stateAtEvent:
          'READY_FOR_RED_DESK',
        kind: 'agent_task',
        destination: {
          kind: 'agent',
          id: 'yann',
        },
        action:
          'perform_red_desk_review',
        summary:
          'Perform Red Desk review.',
        createdAt:
          '2026-01-01T00:00:00.000Z',
        availableAt:
          '2026-01-01T00:00:00.000Z',
        retryPolicy: {
          maxAttempts: 3,
          initialDelayMs: 1_000,
          backoffMultiplier: 2,
          maxDelayMs: 10_000,
          timeoutMs: 30_000,
        },
        policyEvidence: [
          'mandatory_review:yann',
        ],
        payload: {},
      },
    ]);

    const keys: string[] = [];

    const registry =
      new GovernedHandoffSinkRegistry();

    registry.register({
      id: 'fake-yann-runtime',
      destination: {
        kind: 'agent',
        id: 'yann',
      },
      async deliver(context) {
        keys.push(
          context.idempotencyKey,
        );

        return {
          result: {
            accepted: true,
          },
        };
      },
    });

    const dispatcher =
      new GovernedHandoffDispatcher(
        cp,
        registry,
        {
          workerId:
            'handoff-worker',
          batchSize: 10,
          leaseMs: 10_000,
        },
      );

    const result =
      await dispatcher.runOnce(
        '2026-01-01T00:00:01.000Z',
      );

    expect(result.delivered).toBe(1);

    expect(keys).toEqual([
      'handoff:handoff:msg-1:agent:yann:perform_red_desk_review',
    ]);

    expect(
      cp.listHandoffs()[0],
    ).toMatchObject({
      status: 'delivered',
      attempts: 1,
    });

    cp.close();
  });

  test('retries when destination runtime is not yet connected', async () => {
    const cp = store();

    cp.enqueueHandoffsIdempotent([
      {
        handoffId:
          'handoff:msg-2:human:ceo:decide_research_proposal',
        sourceMessageId: 'msg-2',
        sourceTopic:
          'control-plane.workflow.transitioned',
        workflowId: 'wf-2',
        stateAtEvent:
          'WAITING_CEO_RESEARCH_DECISION',
        kind:
          'ceo_approval_request',
        destination: {
          kind: 'human',
          id: 'ceo',
        },
        action:
          'decide_research_proposal',
        summary:
          'CEO decision required.',
        createdAt:
          '2026-01-01T00:00:00.000Z',
        availableAt:
          '2026-01-01T00:00:00.000Z',
        retryPolicy: {
          maxAttempts: 3,
          initialDelayMs: 1_000,
          backoffMultiplier: 2,
          maxDelayMs: 10_000,
          timeoutMs: 30_000,
        },
        policyEvidence: [
          'research_final_decision:ceo',
        ],
        payload: {},
      },
    ]);

    const registry =
      new GovernedHandoffSinkRegistry();

    const dispatcher =
      new GovernedHandoffDispatcher(
        cp,
        registry,
        {
          workerId:
            'handoff-worker',
          batchSize: 10,
          leaseMs: 10_000,
        },
      );

    const result =
      await dispatcher.runOnce(
        '2026-01-01T00:00:01.000Z',
      );

    expect(result.missingSink).toBe(1);

    expect(
      cp.listHandoffs()[0],
    ).toMatchObject({
      status: 'pending',
      attempts: 1,
      lastError:
        'handoff_sink_not_registered:human:ceo',
    });

    cp.close();
  });
});
