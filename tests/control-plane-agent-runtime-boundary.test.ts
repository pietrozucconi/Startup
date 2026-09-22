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
  CompanyAgentRuntimeWorker,
} from '@/lib/control-plane/agent-runtime-worker';

import {
  AgentReadToolRegistry,
} from '@/lib/control-plane/agent-tool-runtime';

import type {
  AgentModelAdapter,
} from '@/lib/control-plane/agent-model-adapter';

import type {
  AgentBrainContextProvider,
} from '@/lib/control-plane/brain-context-provider';

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
      'startup-v2h-runtime-',
    ),
  );

  return new SqliteInternalRuntimeStore(
    path.join(
      tempDir,
      'cp.db',
    ),
  );
}

describe('V2H agent runtime boundary', () => {
  test('read-only tool evidence is captured and governed output still passes through Control Plane', async () => {
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
      assetRef: 'ABC',
      artifacts: [],
      invalidations: [],
      metadata: {},
    });

    cp.upsertAgentRuntimeTask({
      taskId: 'task-1',
      handoffId: 'handoff-1',
      workflowId: 'wf-1',
      agentId: 'lauti',
      action:
        'continue_research',
      summary:
        'Research ABC.',
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

    const tools =
      new AgentReadToolRegistry();

    tools.register({
      id: 'filing-reader',
      capability:
        'company-filings',
      description:
        'Read public company filings.',
      async invoke() {
        return {
          summary:
            'Latest filing retrieved.',
          data: {
            revenue: 100,
          },
          provenance: [
            {
              sourceType:
                'company_filing',
              uri:
                'https://example.com/filing',
              title:
                'ABC annual filing',
              publisher:
                'ABC',
              primary: true,
            },
          ],
        };
      },
    });

    const brain:
      AgentBrainContextProvider = {
      async retrieve() {
        return {
          route: null,
          truncated: false,
          totalContentChars: 10,
          results: [
            {
              node: {
                id:
                  'memory-abc-1',
                type:
                  'experience',
                label:
                  'Prior ABC review',
                summary:
                  'Prior company experience.',
                content:
                  'Relevant prior experience.',
                rationaleSummary:
                  '',
                status:
                  'active',
                tags: [],
                keywords: [],
                context: {
                  departmentIds: [],
                  agentIds: [],
                  assetIds: [],
                  instrumentIds: [],
                  portfolioIds: [],
                  workflowIds: [],
                  decisionIds: [],
                  taskIds: [],
                  jurisdictions: [],
                  horizons: [],
                  marketRegimes: [],
                  scenarios: [],
                  tags: [],
                },
                version: 1,
              },
              score: 0.9,
              breakdown: {
                text: 1,
                salience: 0.5,
                activation: 0,
                confidence: 0.8,
                retention: 1,
                recency: 1,
                graphProximity: 0,
              },
              reasons: [
                'text_match',
              ],
            },
          ],
        };
      },
    };

    const model:
      AgentModelAdapter = {
      id:
        'fake-model-adapter',

      async execute({
        execution,
        tools,
      }) {
        expect(
          execution.constraints
            .financialExecutionToolsAvailable,
        ).toBe(false);

        expect(
          execution.availableTools
            .map(
              (tool) =>
                tool.id,
            ),
        ).toContain(
          'filing-reader',
        );

        await tools.invoke(
          'filing-reader',
          {
            ticker: 'ABC',
          },
        );

        return {
          usage: {
            inputTokens: 500,
            outputTokens: 200,
          },
          model:
            'fake-model',
          output: {
            summary:
              'ABC research completed.',
            operations: [
              {
                type:
                  'register_artifact',
                artifactKind:
                  'research_proposal',
                summary:
                  'ABC research proposal.',
                metadata: {
                  confidence: 0.8,
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
                  'Proposal is ready for Red Desk review.',
              },
            ],
          },
        };
      },
    };

    const times = [
      '2026-01-01T00:00:01.000Z',
      '2026-01-01T00:00:02.000Z',
      '2026-01-01T00:00:03.000Z',
      '2026-01-01T00:00:04.000Z',
      '2026-01-01T00:00:05.000Z',
      '2026-01-01T00:00:06.000Z',
      '2026-01-01T00:00:07.000Z',
      '2026-01-01T00:00:08.000Z',
    ];

    const worker =
      new CompanyAgentRuntimeWorker({
        agentId: 'lauti',
        store: cp,
        modelAdapter: model,
        brainContext: brain,
        toolRegistry: tools,
        runner: {
          workerId:
            'lauti-worker',
          batchSize: 1,
          leaseMs: 30_000,
        },
        clock: () =>
          times.shift() ??
          '2026-01-01T00:00:09.000Z',
      });

    const result =
      await worker.runOnce();

    expect(result).toMatchObject({
      claimed: 1,
      completed: 1,
      failed: 0,
    });

    const workflow =
      await cp.getWorkflow(
        'wf-1',
      );

    expect(
      workflow?.state,
    ).toBe(
      'READY_FOR_RED_DESK',
    );

    const artifact =
      workflow?.artifacts[0];

    expect(
      artifact?.metadata
        .runtimeEvidence,
    ).toMatchObject({
      brainNodeIds: [
        'memory-abc-1',
      ],
    });

    const evidence =
      artifact?.metadata
        .runtimeEvidence as
        | {
            externalProvenance?: Array<{
              sourceType?: string;
            }>;
          }
        | undefined;

    expect(
      evidence
        ?.externalProvenance?.[0]
        ?.sourceType,
    ).toBe(
      'company_filing',
    );

    cp.close();
  });
});
