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
  BrainGateway,
} from '@/lib/brain/gateway/gateway';

import {
  InMemoryBrainAuditStore,
  InMemoryBrainGraphStore,
} from '@/lib/brain/gateway/store';

import {
  BrainGraphSchema,
} from '@/lib/brain/graph-schema';

import {
  DefaultBrainHandoffMutationComposer,
} from '@/lib/control-plane/default-brain-memory-composer';

import {
  DurableStartupBrainProposalHandoffSink,
} from '@/lib/control-plane/durable-brain-proposal-sink';

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

const emptyGraph =
  BrainGraphSchema.parse({
    schemaVersion: 1,
    graphId:
      'startup-brain',
    revision: 0,
    generatedAt:
      '2026-01-01T00:00:00.000Z',
    nodes: [],
    edges: [],
    metadata: {},
  });

describe(
  'V2I.2B durable Brain proposal inbox',
  () => {
    test(
      'proposal survives store reopen and graph remains unchanged',
      async () => {
        tempDir =
          mkdtempSync(
            path.join(
              tmpdir(),
              'startup-brain-proposal-',
            ),
          );

        const dbPath =
          path.join(
            tempDir,
            'cp.db',
          );

        const store =
          new SqliteHardenedRuntimeStore(
            dbPath,
          );

        const graphStore =
          new InMemoryBrainGraphStore(
            emptyGraph,
          );

        const gateway =
          new BrainGateway(
            graphStore,
            new InMemoryBrainAuditStore(),
            () =>
              '2026-01-01T00:00:02.000Z',
          );

        const sink =
          new DurableStartupBrainProposalHandoffSink(
            store,
            gateway,
            new DefaultBrainHandoffMutationComposer(),
            () =>
              '2026-01-01T00:00:03.000Z',
          );

        const result =
          await sink.deliver({
            handoff: {
              handoffId:
                'handoff-memory-1',
              sourceMessageId:
                'source-message-1',
              sourceTopic:
                'control-plane.workflow.transitioned',
              workflowId:
                'wf-1',
              stateAtEvent:
                'ARCHIVED',
              kind:
                'memory_candidate',
              destination: {
                kind:
                  'startup_brain',
                id:
                  'startup-brain',
              },
              action:
                'compose_archived_workflow_experience',
              summary:
                'Archive completed workflow experience.',
              status:
                'pending',
              attempts: 1,
              createdAt:
                '2026-01-01T00:00:00.000Z',
              availableAt:
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
              policyEvidence: [
                'memory:experience_creation',
              ],
              payload: {
                memoryPolicy:
                  'candidate_only_no_automatic_permanent_commit',
              },
            },
            idempotencyKey:
              'handoff:handoff-memory-1',
            deliveryAttempt:
              1,
          });

        expect(
          result.result,
        ).toMatchObject({
          proposed:
            true,
          durableStatus:
            'pending_control_plane',
          gatewayStatus:
            'pending_control_plane',
        });

        expect(
          store.listBrainMutationProposals(),
        ).toHaveLength(1);

        const graphAfter =
          await graphStore.getSnapshot();

        expect(
          graphAfter.nodes,
        ).toHaveLength(0);

        store.close();

        const reopened =
          new SqliteHardenedRuntimeStore(
            dbPath,
          );

        expect(
          reopened.listBrainMutationProposals()[0],
        ).toMatchObject({
          proposalId:
            'brain-proposal:handoff-memory-1',
          handoffId:
            'handoff-memory-1',
          status:
            'pending_control_plane',
        });

        reopened.close();
      },
    );
  },
);
