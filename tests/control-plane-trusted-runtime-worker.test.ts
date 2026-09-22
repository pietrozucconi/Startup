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
        'startup-trusted-worker-',
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
  'trusted runtime worker',
  () => {
    test(
      'rejects a token issued for a different employee',
      () => {
        const cp = store();

        const authority =
          new HmacRuntimeIdentityAuthority(
            '0123456789abcdef0123456789abcdef',
            () =>
              '2026-01-01T00:00:00.000Z',
            () =>
              'session-pepo',
          );

        const token =
          authority.issueAgentSession({
            profile:
              getCompanyAgentRuntimeProfile(
                'pepo',
              ),
            ttlMs: 60_000,
          }).token;

        const model:
          AgentModelAdapter = {
          id: 'fake-model',
          async execute() {
            return {
              usage: {
                inputTokens: 1,
                outputTokens: 1,
              },
              output: {
                summary:
                  'Nothing.',
                operations: [],
              },
            };
          },
        };

        expect(() =>
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
                'trusted-lauti-worker',
              batchSize: 1,
              leaseMs: 30_000,
            },
            clock: () =>
              '2026-01-01T00:00:30.000Z',
          }),
        ).toThrow(
          'runtime_identity_agent_mismatch:lauti',
        );

        cp.close();
      },
    );

    test(
      'valid identity registers worker and runs only its own queue',
      async () => {
        const cp = store();

        const authority =
          new HmacRuntimeIdentityAuthority(
            '0123456789abcdef0123456789abcdef',
            () =>
              '2026-01-01T00:00:00.000Z',
            () =>
              'session-lauti',
          );

        const profile =
          getCompanyAgentRuntimeProfile(
            'lauti',
          );

        const token =
          authority.issueAgentSession({
            profile,
            ttlMs: 60_000,
          }).token;

        cp.upsertAgentRuntimeTask({
          taskId:
            'task-lauti',
          handoffId:
            'handoff-lauti',
          agentId:
            'lauti',
          action: 'noop',
          summary:
            'Identity test.',
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

        cp.upsertAgentRuntimeTask({
          taskId:
            'task-pepo',
          handoffId:
            'handoff-pepo',
          agentId:
            'pepo',
          action: 'noop',
          summary:
            'Other agent task.',
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
          id: 'fake-model',
          async execute() {
            return {
              usage: {
                inputTokens: 1,
                outputTokens: 1,
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
                'trusted-lauti-worker',
              batchSize: 1,
              leaseMs: 30_000,
            },
            clock: () =>
              '2026-01-01T00:00:30.000Z',
          });

        expect(
          cp.listRuntimeWorkers(),
        ).toHaveLength(1);

        const result =
          await worker.runOnce();

        expect(
          result,
        ).toMatchObject({
          claimed: 1,
          completed: 1,
          failed: 0,
        });

        expect(
          cp.listAgentRuntimeTasks({
            agentId: 'lauti',
          })[0].status,
        ).toBe('completed');

        expect(
          cp.listAgentRuntimeTasks({
            agentId: 'pepo',
          })[0].status,
        ).toBe('queued');

        expect(
          cp.listExecutionRuns(),
        ).toHaveLength(1);

        cp.close();
      },
    );
  },
);
