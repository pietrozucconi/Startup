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
} from '@/lib/control-plane/handoff-dispatcher';

import {
  buildInternalRuntimeSinkRegistry,
} from '@/lib/control-plane/runtime-bootstrap';

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
      'startup-runtime-',
    ),
  );

  return new SqliteInternalRuntimeStore(
    path.join(
      tempDir,
      'cp.db',
    ),
  );
}

const retryPolicy = {
  maxAttempts: 3,
  initialDelayMs: 1_000,
  backoffMultiplier: 2,
  maxDelayMs: 10_000,
  timeoutMs: 30_000,
};

describe('Internal runtime adapters', () => {
  test('materializes an agent handoff as an idempotent durable runtime task', async () => {
    const cp = store();

    cp.enqueueHandoffsIdempotent([
      {
        handoffId:
          'handoff:msg-1:agent:yann:red-desk',
        sourceMessageId:
          'msg-1',
        sourceTopic:
          'control-plane.workflow.transitioned',
        workflowId: 'wf-1',
        stateAtEvent:
          'READY_FOR_RED_DESK',
        kind:
          'agent_task',
        destination: {
          kind: 'agent',
          id: 'yann',
        },
        action:
          'perform_red_desk_review',
        summary:
          'Perform the Red Desk review.',
        createdAt:
          '2026-01-01T00:00:00.000Z',
        availableAt:
          '2026-01-01T00:00:00.000Z',
        retryPolicy,
        policyEvidence: [
          'mandatory_review:yann',
        ],
        payload: {},
      },
    ]);

    const registry =
      buildInternalRuntimeSinkRegistry({
        store: cp,
      });

    const dispatcher =
      new GovernedHandoffDispatcher(
        cp,
        registry,
        {
          workerId:
            'runtime-dispatcher',
          batchSize: 10,
          leaseMs: 10_000,
        },
      );

    const result =
      await dispatcher.runOnce(
        '2026-01-01T00:00:01.000Z',
      );

    expect(result.delivered).toBe(1);

    const tasks =
      cp.listAgentRuntimeTasks({
        agentId: 'yann',
      });

    expect(tasks).toHaveLength(1);

    expect(tasks[0]).toMatchObject({
      agentId: 'yann',
      status: 'queued',
      action:
        'perform_red_desk_review',
    });

    /*
     * Simulate a repeated downstream sink call after a crash.
     * UNIQUE handoff_id keeps one runtime task.
     */
    const sink =
      registry.resolve({
        kind: 'agent',
        id: 'yann',
      });

    expect(sink).not.toBeNull();

    await sink!.deliver({
      handoff:
        cp.listHandoffs()[0],
      idempotencyKey:
        'handoff:repeat',
      deliveryAttempt: 2,
    });

    expect(
      cp.listAgentRuntimeTasks({
        agentId: 'yann',
      }),
    ).toHaveLength(1);

    cp.close();
  });

  test('materializes CEO approval requests in the durable CEO inbox', async () => {
    const cp = store();

    cp.enqueueHandoffsIdempotent([
      {
        handoffId:
          'handoff:msg-ceo:human:ceo:research',
        sourceMessageId:
          'msg-ceo',
        sourceTopic:
          'control-plane.workflow.transitioned',
        workflowId: 'wf-ceo',
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
          'CEO research decision required.',
        createdAt:
          '2026-01-01T00:00:00.000Z',
        availableAt:
          '2026-01-01T00:00:00.000Z',
        retryPolicy,
        policyEvidence: [
          'research_final_decision:ceo',
        ],
        payload: {},
      },
    ]);

    const registry =
      buildInternalRuntimeSinkRegistry({
        store: cp,
      });

    const dispatcher =
      new GovernedHandoffDispatcher(
        cp,
        registry,
        {
          workerId:
            'runtime-dispatcher',
          batchSize: 10,
          leaseMs: 10_000,
        },
      );

    await dispatcher.runOnce(
      '2026-01-01T00:00:01.000Z',
    );

    expect(
      cp.listCeoInbox(),
    ).toHaveLength(1);

    expect(
      cp.listCeoInbox()[0],
    ).toMatchObject({
      category:
        'approval_request',
      status: 'pending',
      action:
        'decide_research_proposal',
    });

    cp.close();
  });
});
