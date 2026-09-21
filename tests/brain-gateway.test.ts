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
  routeBrainIntent,
} from '@/lib/brain/gateway/routing';

import {
  addNode,
  createEmptyBrainGraph,
} from '@/lib/brain/graph-ops';

function principal(
  kind: 'agent' | 'human' | 'control_plane' | 'system',
  id: string,
  capabilities: Array<
    | 'brain.read'
    | 'brain.retrieve'
    | 'brain.inspect'
    | 'brain.health'
    | 'brain.propose_write'
    | 'brain.commit_write'
    | 'brain.read_confidential'
    | 'brain.read_restricted'
    | 'brain.admin'
  >,
) {
  return {
    actor: { kind, id },
    departmentIds: ['dept-research'],
    capabilities,
    issuedBy: 'control-plane',
  };
}

function experienceNode(id: string) {
  return {
    id,
    type: 'experience' as const,
    label: 'Rates valuation experience',
    summary: 'Higher rates compressed equity valuations.',
    content:
      'Long-form institutional memory content that may be budget-truncated.',
    rationaleSummary: 'Valuation sensitivity increased as rates moved higher.',
    status: 'active' as const,
    tags: ['rates', 'equities'],
    keywords: ['valuation'],
    context: {
      departmentIds: ['dept-research'],
      assetIds: ['asset:example'],
    },
    epistemic: {
      kind: 'interpretation' as const,
      confidence: 0.8,
      verification: 'partially_verified' as const,
      uncertaintyReasons: [],
      provenance: [],
      evidenceForNodeIds: [],
      evidenceAgainstNodeIds: [],
      temporal: {},
    },
    memory: {
      system: 'episodic' as const,
      stage: 'interpreted_experience' as const,
      salience: {
        novelty: 0.3,
        surprise: 0.3,
        materiality: 0.8,
        urgency: 0.2,
        riskImpact: 0.6,
        expectedUtility: 0.8,
      },
      activation: 0,
      retentionStrength: 1,
      consolidationScore: 0.2,
      accessCount: 0,
      rehearsalCount: 0,
      retentionLock: false,
      pendingReview: false,
    },
    governance: {},
    audit: {
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    version: 1,
    metadata: {},
  };
}

async function gatewayWithNode() {
  let graph = createEmptyBrainGraph(
    'test',
    '2026-01-01T00:00:00.000Z',
  );

  graph = addNode(
    graph,
    experienceNode('exp:rates'),
    '2026-01-01T00:00:01.000Z',
  );

  const graphStore =
    new InMemoryBrainGraphStore(graph);

  const auditStore =
    new InMemoryBrainAuditStore();

  const gateway = new BrainGateway(
    graphStore,
    auditStore,
    () => '2026-01-01T01:00:00.000Z',
  );

  return {
    gateway,
    graphStore,
    auditStore,
  };
}

describe('Brain Gateway', () => {
  test('routes current market price away from Startup Brain', () => {
    expect(
      routeBrainIntent('current_market_price'),
    ).toMatchObject({
      routes: ['market_data'],
      brainRequired: false,
    });
  });

  test('routes mixed context to Brain plus current sources', () => {
    const decision = routeBrainIntent(
      'mixed_brain_and_current_context',
    );

    expect(decision.brainRequired).toBe(true);
    expect(decision.routes).toContain('brain');
    expect(decision.routes).toContain('market_data');
    expect(decision.routes).toContain('web');
  });

  test('retrieves memory through capability and budget controls', async () => {
    const { gateway } =
      await gatewayWithNode();

    const result = await gateway.read({
      requestId: 'read-1',
      principal: principal(
        'agent',
        'lauti',
        ['brain.read', 'brain.retrieve'],
      ),
      intent: 'institutional_memory',
      purpose: 'Recall relevant valuation experience.',
      query: {
        text: 'rates valuation',
        limit: 20,
      },
      context: {},
      budget: {
        maxResults: 5,
        maxHops: 2,
        maxContentCharsPerNode: 10,
        maxTotalContentChars: 10,
        includeContent: true,
        includeMetadata: false,
      },
    });

    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.node.id).toBe(
      'exp:rates',
    );
    expect(
      result.results[0]?.node.content?.length,
    ).toBeLessThanOrEqual(10);
  });

  test('denies retrieval without retrieve capability', async () => {
    const { gateway } =
      await gatewayWithNode();

    await expect(
      gateway.read({
        requestId: 'read-denied',
        principal: principal(
          'agent',
          'lauti',
          ['brain.read'],
        ),
        intent: 'institutional_memory',
        purpose: 'Recall memory.',
        query: {
          text: 'rates',
        },
        context: {},
        budget: {},
      }),
    ).rejects.toThrow(
      'principal_missing_brain_retrieve_capability',
    );
  });

  test('agents may propose but never commit mutations', async () => {
    const { gateway } =
      await gatewayWithNode();

    const agent = principal(
      'agent',
      'lauti',
      [
        'brain.read',
        'brain.retrieve',
        'brain.propose_write',
        'brain.commit_write',
      ],
    );

    const proposal = {
      proposalId: 'proposal-1',
      requestId: 'mutation-1',
      principal: agent,
      purpose: 'Record a new interpreted experience.',
      reason: 'Material learning from completed analysis.',
      proposedAt:
        '2026-01-01T01:00:00.000Z',
      context: {},
      events: [
        {
          eventId: 'event-1',
          at:
            '2026-01-01T01:00:00.000Z',
          actor: agent.actor,
          reason: 'Record experience',
          type: 'node_added' as const,
          payload: {
            node: experienceNode('exp:new'),
          },
        },
      ],
    };

    const proposed =
      await gateway.proposeMutation(
        proposal,
      );

    expect(proposed.status).toBe(
      'pending_control_plane',
    );

    await expect(
      gateway.commitMutation({
        requestId: 'commit-agent',
        principal: agent,
        proposal,
      }),
    ).rejects.toThrow(
      'agents_may_propose_but_never_commit_brain_mutations',
    );
  });

  test('control plane can commit an authorized proposal with optimistic concurrency', async () => {
    const {
      gateway,
      graphStore,
    } = await gatewayWithNode();

    const agent = principal(
      'agent',
      'lauti',
      ['brain.propose_write'],
    );

    const proposal = {
      proposalId: 'proposal-2',
      requestId: 'mutation-2',
      principal: agent,
      purpose: 'Record a new interpreted experience.',
      reason: 'Material learning.',
      proposedAt:
        '2026-01-01T01:00:00.000Z',
      context: {},
      events: [
        {
          eventId: 'event-2',
          at:
            '2026-01-01T01:00:00.000Z',
          actor: agent.actor,
          reason: 'Record experience',
          type: 'node_added' as const,
          payload: {
            node: experienceNode('exp:new'),
          },
        },
      ],
    };

    const before =
      await graphStore.getSnapshot();

    const controlPlane = principal(
      'control_plane',
      'company-control-plane',
      ['brain.commit_write'],
    );

    const result =
      await gateway.commitMutation({
        requestId: 'commit-control-plane',
        principal: controlPlane,
        proposal,
        expectedRevision: before.revision,
      });

    expect(
      result.committedEventCount,
    ).toBe(1);

    expect(
      result.graphRevisionAfter,
    ).toBeGreaterThan(
      result.graphRevisionBefore,
    );

    const after =
      await graphStore.getSnapshot();

    expect(
      after.nodes.some(
        (node) => node.id === 'exp:new',
      ),
    ).toBe(true);
  });

  test('every gateway action creates auditable records', async () => {
    const {
      gateway,
      auditStore,
    } = await gatewayWithNode();

    await gateway.read({
      requestId: 'audit-read',
      principal: principal(
        'agent',
        'lauti',
        ['brain.read', 'brain.retrieve'],
      ),
      intent: 'institutional_memory',
      purpose: 'Recall experience.',
      query: {
        text: 'rates',
      },
      context: {},
      budget: {},
    });

    const records =
      await auditStore.list();

    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      requestId: 'audit-read',
      action: 'brain.read',
      outcome: 'allowed',
    });
  });
});
