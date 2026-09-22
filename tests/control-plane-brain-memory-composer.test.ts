import {
  describe,
  expect,
  test,
} from 'vitest';

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
  StartupBrainProposalHandoffSink,
} from '@/lib/control-plane/brain-handoff-sink';

import {
  DefaultBrainHandoffMutationComposer,
} from '@/lib/control-plane/default-brain-memory-composer';

const emptyGraph =
  BrainGraphSchema.parse({
    schemaVersion: 1,
    graphId: 'startup-brain',
    revision: 0,
    generatedAt:
      '2026-01-01T00:00:00.000Z',
    nodes: [],
    edges: [],
    metadata: {},
  });

describe('Default Startup Brain memory composer', () => {
  test('creates a raw experience proposal but does not commit it', async () => {
    const graphStore =
      new InMemoryBrainGraphStore(
        emptyGraph,
      );

    const auditStore =
      new InMemoryBrainAuditStore();

    const gateway =
      new BrainGateway(
        graphStore,
        auditStore,
        () =>
          '2026-01-01T00:00:01.000Z',
      );

    const sink =
      new StartupBrainProposalHandoffSink(
        gateway,
        new DefaultBrainHandoffMutationComposer(),
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
          workflowId: 'wf-1',
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
          status: 'pending',
          attempts: 1,
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
            'memory:experience_creation',
          ],
          payload: {
            memoryPolicy:
              'candidate_only_no_automatic_permanent_commit',
          },
        },
        idempotencyKey:
          'handoff:memory-1',
        deliveryAttempt: 1,
      });

    expect(result.result).toMatchObject({
      proposed: true,
      status:
        'pending_control_plane',
    });

    const graphAfter =
      await graphStore.getSnapshot();

    expect(
      graphAfter.nodes,
    ).toHaveLength(0);

    const audits =
      await auditStore.list();

    expect(audits).toHaveLength(1);

    expect(audits[0]).toMatchObject({
      action:
        'brain.propose_mutation',
      outcome: 'proposed',
    });
  });

  test('refuses to turn a normal agent task into memory', async () => {
    const composer =
      new DefaultBrainHandoffMutationComposer();

    const proposal =
      await composer.compose({
        handoff: {
          handoffId:
            'handoff-task-1',
          sourceMessageId:
            'source-message-1',
          sourceTopic:
            'control-plane.workflow.transitioned',
          workflowId: 'wf-1',
          stateAtEvent:
            'RISK_ANALYSIS',
          kind:
            'agent_task',
          destination: {
            kind: 'agent',
            id: 'manuel',
          },
          action:
            'analyze_portfolio_risk',
          summary:
            'Analyze portfolio risk.',
          status: 'pending',
          attempts: 1,
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
          policyEvidence: [],
          payload: {},
        },
        idempotencyKey:
          'handoff:task-1',
      });

    expect(proposal).toBeNull();
  });
});
