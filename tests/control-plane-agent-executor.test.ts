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
  GovernedAgentExecutorRunner,
  type AgentExecutor,
} from '@/lib/control-plane/agent-executor';

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
      'startup-agent-executor-',
    ),
  );

  return new SqliteInternalRuntimeStore(
    path.join(
      tempDir,
      'cp.db',
    ),
  );
}

describe('Governed agent executor contract', () => {
  test('agent output becomes governed artifact and transition commands', async () => {
    const cp = store();

    await cp.createWorkflow({
      id: 'wf-1',
      state: 'RESEARCHING',
      revision: 0,
      createdBy: {
        kind: 'agent',
        id: 'lauti',
      },
      createdAt:
        '2026-01-01T00:00:00.000Z',
      updatedAt:
        '2026-01-01T00:00:00.000Z',
      responsibleResearchAgentId:
        'lauti',
      artifacts: [],
      invalidations: [],
      metadata: {},
    });

    cp.upsertAgentRuntimeTask({
      taskId: 'task-1',
      handoffId: 'handoff-1',
      workflowId: 'wf-1',
      agentId: 'lauti',
      action: 'continue_research',
      summary:
        'Prepare research proposal.',
      stateAtAssignment:
        'RESEARCHING',
      createdAt:
        '2026-01-01T00:00:00.000Z',
      availableAt:
        '2026-01-01T00:00:00.000Z',
      updatedAt:
        '2026-01-01T00:00:00.000Z',
      retryPolicy: {
        maxAttempts: 3,
        initialDelayMs: 1_000,
        backoffMultiplier: 2,
        maxDelayMs: 10_000,
        timeoutMs: 30_000,
      },
      policyEvidence: [],
      payload: {},
    });

    const executor:
      AgentExecutor = {
      id: 'fake-lauti',
      agentId: 'lauti',

      async execute() {
        return {
          summary:
            'Research proposal completed.',
          operations: [
            {
              type:
                'register_artifact',
              artifactKind:
                'research_proposal',
              summary:
                'Governed research proposal.',
              metadata: {
                test: true,
              },
            },
            {
              type:
                'request_transition',
              fromState:
                'RESEARCHING',
              toState:
                'READY_FOR_RED_DESK',
              reason:
                'Research proposal is ready for independent review.',
            },
          ],
        };
      },
    };

    const times = [
      '2026-01-01T00:00:01.000Z',
      '2026-01-01T00:00:02.000Z',
      '2026-01-01T00:00:03.000Z',
      '2026-01-01T00:00:04.000Z',
      '2026-01-01T00:00:05.000Z',
    ];

    const runner =
      new GovernedAgentExecutorRunner(
        cp,
        executor,
        {
          workerId:
            'lauti-worker',
          batchSize: 1,
          leaseMs: 10_000,
        },
        () =>
          times.shift() ??
          '2026-01-01T00:00:06.000Z',
      );

    const result =
      await runner.runOnce();

    expect(result).toMatchObject({
      claimed: 1,
      completed: 1,
      failed: 0,
    });

    const workflow =
      await cp.getWorkflow(
        'wf-1',
      );

    expect(workflow?.state).toBe(
      'READY_FOR_RED_DESK',
    );

    expect(
      workflow?.artifacts,
    ).toHaveLength(1);

    expect(
      workflow?.artifacts[0],
    ).toMatchObject({
      kind:
        'research_proposal',
      createdBy: {
        kind: 'agent',
        id: 'lauti',
      },
    });

    expect(
      cp.listAgentRuntimeTasks()[0],
    ).toMatchObject({
      status: 'completed',
    });

    cp.close();
  });

  test('executor cannot smuggle a CEO artifact through the agent contract', async () => {
    const cp = store();

    await cp.createWorkflow({
      id: 'wf-2',
      state:
        'WAITING_CEO_RESEARCH_DECISION',
      revision: 0,
      createdBy: {
        kind: 'agent',
        id: 'lauti',
      },
      createdAt:
        '2026-01-01T00:00:00.000Z',
      updatedAt:
        '2026-01-01T00:00:00.000Z',
      artifacts: [],
      invalidations: [],
      metadata: {},
    });

    cp.upsertAgentRuntimeTask({
      taskId: 'task-2',
      handoffId: 'handoff-2',
      workflowId: 'wf-2',
      agentId: 'lauti',
      action: 'malicious-test',
      summary:
        'Attempt unauthorized artifact.',
      createdAt:
        '2026-01-01T00:00:00.000Z',
      availableAt:
        '2026-01-01T00:00:00.000Z',
      updatedAt:
        '2026-01-01T00:00:00.000Z',
      retryPolicy: {
        maxAttempts: 1,
        initialDelayMs: 1_000,
        backoffMultiplier: 2,
        maxDelayMs: 10_000,
        timeoutMs: 30_000,
      },
      policyEvidence: [],
      payload: {},
    });

    const executor:
      AgentExecutor = {
      id: 'fake-malicious',
      agentId: 'lauti',

      async execute() {
        return {
          summary: 'Attempted.',
          operations: [
            {
              type:
                'register_artifact',
              artifactKind:
                'ceo_research_decision',
              summary:
                'Fake CEO approval.',
              metadata: {
                decision:
                  'approved',
              },
            },
          ],
        };
      },
    };

    const runner =
      new GovernedAgentExecutorRunner(
        cp,
        executor,
        {
          workerId:
            'lauti-worker',
          batchSize: 1,
          leaseMs: 10_000,
        },
        () =>
          '2026-01-01T00:00:01.000Z',
      );

    const result =
      await runner.runOnce();

    expect(result.failed).toBe(1);

    expect(
      cp.listAgentRuntimeTasks()[0],
    ).toMatchObject({
      status:
        'dead_letter',
      attempts: 1,
    });

    const workflow =
      await cp.getWorkflow(
        'wf-2',
      );

    expect(
      workflow?.artifacts,
    ).toHaveLength(0);

    cp.close();
  });
});
