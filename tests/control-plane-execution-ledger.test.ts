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
  AgentReadToolRegistry,
} from '@/lib/control-plane/agent-tool-runtime';

import {
  EmptyAgentBrainContextProvider,
} from '@/lib/control-plane/brain-context-provider';

import type {
  AgentModelAdapter,
} from '@/lib/control-plane/agent-model-adapter';

import {
  getCompanyAgentRuntimeProfile,
} from '@/lib/control-plane/agent-runtime-profile';

import {
  HmacRuntimeIdentityAuthority,
} from '@/lib/control-plane/runtime-identity';

import {
  TrustedCompanyAgentRuntimeWorker,
} from '@/lib/control-plane/trusted-agent-runtime-worker';

import {
  SqliteHardenedRuntimeStore,
} from '@/lib/control-plane/sqlite-hardened-runtime-store';

let tempDir:
  | string
  | null = null;

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
  tempDir =
    mkdtempSync(
      path.join(
        tmpdir(),
        'startup-execution-ledger-',
      ),
    );

  return new SqliteHardenedRuntimeStore(
    path.join(
      tempDir,
      'cp.db',
    ),
  );
}

describe(
  'V2I.2B execution run ledger',
  () => {
    test(
      'records model usage and estimated cost for a successful run',
      async () => {
        const cp = store();

        const profile =
          getCompanyAgentRuntimeProfile(
            'lauti',
          );

        const authority =
          new HmacRuntimeIdentityAuthority(
            '0123456789abcdef0123456789abcdef',
            () =>
              '2026-01-01T00:00:00.000Z',
            () =>
              'session-lauti',
          );

        const token =
          authority
            .issueAgentSession({
              profile,
              ttlMs:
                60_000,
            })
            .token;

        cp.upsertAgentRuntimeTask({
          taskId:
            'task-1',
          handoffId:
            'handoff-1',
          agentId:
            'lauti',
          action:
            'noop',
          summary:
            'Run ledger test.',
          createdAt:
            '2026-01-01T00:00:00.000Z',
          availableAt:
            '2026-01-01T00:00:00.000Z',
          updatedAt:
            '2026-01-01T00:00:00.000Z',
          retryPolicy: {
            maxAttempts: 3,
            initialDelayMs:
              1_000,
            backoffMultiplier:
              2,
            maxDelayMs:
              10_000,
            timeoutMs:
              30_000,
          },
          policyEvidence: [],
          payload: {},
        });

        const model:
          AgentModelAdapter = {
          id:
            'fake-model-adapter',

          async execute() {
            return {
              model:
                'fake-model-v1',
              finishReason:
                'stop',
              usage: {
                inputTokens:
                  500,
                outputTokens:
                  100,
                cachedInputTokens:
                  50,
                reasoningTokens:
                  25,
                estimatedCostUsd:
                  0.0123,
              },
              output: {
                summary:
                  'Completed.',
                operations: [],
              },
            };
          },
        };

        const worker =
          new TrustedCompanyAgentRuntimeWorker({
            agentId:
              'lauti',
            identityToken:
              token,
            identityVerifier:
              authority,
            store:
              cp,
            modelAdapter:
              model,
            brainContext:
              new EmptyAgentBrainContextProvider(),
            toolRegistry:
              new AgentReadToolRegistry(),
            runner: {
              workerId:
                'worker-lauti',
              batchSize: 1,
              leaseMs:
                30_000,
            },
            clock: () =>
              '2026-01-01T00:00:30.000Z',
          });

        const result =
          await worker.runOnce();

        expect(
          result,
        ).toMatchObject({
          claimed: 1,
          completed: 1,
          failed: 0,
        });

        const runs =
          cp.listExecutionRuns({
            taskId:
              'task-1',
          });

        expect(
          runs,
        ).toHaveLength(1);

        expect(
          runs[0],
        ).toMatchObject({
          status:
            'succeeded',
          model:
            'fake-model-v1',
          finishReason:
            'stop',
          inputTokens:
            500,
          outputTokens:
            100,
          cachedInputTokens:
            50,
          reasoningTokens:
            25,
          toolCallCount:
            0,
          toolFailureCount:
            0,
          estimatedCostUsd:
            0.0123,
        });

        expect(
          cp.listRuntimeObservabilityEvents({
            runId:
              runs[0].runId,
          }).map(
            (event) =>
              event.kind,
          ),
        ).toEqual([
          'execution_started',
          'execution_succeeded',
        ]);

        cp.close();
      },
    );
  },
);
