import {
  describe,
  expect,
  test,
} from 'vitest';

import {
  CompanyControlPlane,
} from '@/lib/control-plane/engine';

import {
  InMemoryControlPlaneStore,
} from '@/lib/control-plane/store';

function actor(
  kind: 'agent' | 'human' | 'system' | 'control_plane',
  id: string,
) {
  return {
    actor: { kind, id },
  };
}

function cp() {
  const store =
    new InMemoryControlPlaneStore();

  const engine =
    new CompanyControlPlane(
      store,
      () =>
        '2026-01-01T00:00:00.000Z',
    );

  return {
    engine,
    store,
  };
}

async function createResearchWorkflow() {
  const ctx = cp();

  await ctx.engine.createWorkflow({
    requestId: 'create-1',
    workflowId: 'wf-1',
    principal: actor(
      'agent',
      'lauti',
    ),
    responsibleResearchAgentId: 'lauti',
    assetRef: 'asset:example',
    reason: 'Start equity research workflow.',
    metadata: {},
  });

  return ctx;
}

describe('Company Control Plane engine', () => {
  test('creates canonical workflows in DRAFT', async () => {
    const { engine } =
      await createResearchWorkflow();

    const workflow =
      await engine.getWorkflow('wf-1');

    expect(workflow.state).toBe('DRAFT');
    expect(workflow.revision).toBe(0);
  });

  test('prevents skipping mandatory research gates', async () => {
    const { engine } =
      await createResearchWorkflow();

    await engine.transition({
      requestId: 'to-research',
      workflowId: 'wf-1',
      principal: actor(
        'agent',
        'lauti',
      ),
      fromState: 'DRAFT',
      toState: 'RESEARCHING',
      expectedRevision: 0,
      reason: 'Begin research.',
    });

    await expect(
      engine.transition({
        requestId: 'to-red-desk',
        workflowId: 'wf-1',
        principal: actor(
          'agent',
          'lauti',
        ),
        fromState: 'RESEARCHING',
        toState: 'READY_FOR_RED_DESK',
        expectedRevision: 1,
        reason: 'Send to Red Desk.',
      }),
    ).rejects.toThrow(
      'research_proposal_required',
    );
  });

  test('accepts append-only research artifact then unlocks next gate', async () => {
    const { engine } =
      await createResearchWorkflow();

    await engine.transition({
      requestId: 'to-research',
      workflowId: 'wf-1',
      principal: actor(
        'agent',
        'lauti',
      ),
      fromState: 'DRAFT',
      toState: 'RESEARCHING',
      expectedRevision: 0,
      reason: 'Begin research.',
    });

    await engine.registerArtifact({
      requestId: 'proposal',
      workflowId: 'wf-1',
      principal: actor(
        'agent',
        'lauti',
      ),
      expectedRevision: 1,
      artifact: {
        id: 'artifact-proposal',
        workflowId: 'wf-1',
        kind: 'research_proposal',
        createdBy: {
          kind: 'agent',
          id: 'lauti',
        },
        createdAt:
          '2026-01-01T00:00:00.000Z',
        summary: 'Equity proposal.',
        metadata: {},
      },
      reason: 'Persist original proposal.',
    });

    const result =
      await engine.transition({
        requestId: 'to-red-desk',
        workflowId: 'wf-1',
        principal: actor(
          'agent',
          'lauti',
        ),
        fromState: 'RESEARCHING',
        toState: 'READY_FOR_RED_DESK',
        expectedRevision: 2,
        reason: 'Proposal complete.',
      });

    expect(result.workflow.state).toBe(
      'READY_FOR_RED_DESK',
    );
  });

  test('CEO-only decisions cannot be performed by an agent', async () => {
    const { engine, store } = cp();

    await store.createWorkflow({
      id: 'wf-ceo',
      state:
        'WAITING_CEO_RESEARCH_DECISION',
      revision: 0,
      createdBy: {
        kind: 'control_plane',
        id: 'cp',
      },
      createdAt:
        '2026-01-01T00:00:00.000Z',
      updatedAt:
        '2026-01-01T00:00:00.000Z',
      artifacts: [
        {
          id: 'ceo-decision',
          workflowId: 'wf-ceo',
          kind: 'ceo_research_decision',
          createdBy: {
            kind: 'human',
            id: 'ceo',
          },
          createdAt:
            '2026-01-01T00:00:00.000Z',
          summary: 'Approved.',
          status: 'active',
          metadata: {
            decision: 'approved',
          },
        },
      ],
      invalidations: [],
      metadata: {},
    });

    await expect(
      engine.transition({
        requestId: 'fake-ceo',
        workflowId: 'wf-ceo',
        principal: actor(
          'agent',
          'beppe',
        ),
        fromState:
          'WAITING_CEO_RESEARCH_DECISION',
        toState:
          'CEO_RESEARCH_APPROVED',
        expectedRevision: 0,
        reason: 'Attempt bypass.',
      }),
    ).rejects.toThrow(
      'ceo_required_for_transition',
    );

    const approved =
      await engine.transition({
        requestId: 'real-ceo',
        workflowId: 'wf-ceo',
        principal: actor(
          'human',
          'ceo',
        ),
        fromState:
          'WAITING_CEO_RESEARCH_DECISION',
        toState:
          'CEO_RESEARCH_APPROVED',
        expectedRevision: 0,
        reason: 'Human CEO approved.',
      });

    expect(approved.workflow.state).toBe(
      'CEO_RESEARCH_APPROVED',
    );
  });

  test('all four mandatory risk analyses are required before risk review', async () => {
    const { engine, store } = cp();

    await store.createWorkflow({
      id: 'wf-risk',
      state: 'RISK_ANALYSIS',
      revision: 0,
      createdBy: {
        kind: 'control_plane',
        id: 'cp',
      },
      createdAt:
        '2026-01-01T00:00:00.000Z',
      updatedAt:
        '2026-01-01T00:00:00.000Z',
      artifacts: [],
      invalidations: [],
      metadata: {},
    });

    await expect(
      engine.transition({
        requestId: 'risk-review',
        workflowId: 'wf-risk',
        principal: actor(
          'agent',
          'christian',
        ),
        fromState: 'RISK_ANALYSIS',
        toState: 'RISK_REVIEW',
        expectedRevision: 0,
        reason: 'Request review.',
      }),
    ).rejects.toThrow(
      'manuel_portfolio_risk_assessment_required',
    );
  });

  test('active material invalidation blocks CEO execution confirmation', async () => {
    const { engine, store } = cp();

    await store.createWorkflow({
      id: 'wf-exec',
      state:
        'WAITING_CEO_EXECUTION',
      revision: 0,
      createdBy: {
        kind: 'control_plane',
        id: 'cp',
      },
      createdAt:
        '2026-01-01T00:00:00.000Z',
      updatedAt:
        '2026-01-01T00:00:00.000Z',
      artifacts: [
        {
          id: 'confirmation',
          workflowId: 'wf-exec',
          kind:
            'ceo_execution_confirmation',
          createdBy: {
            kind: 'human',
            id: 'ceo',
          },
          createdAt:
            '2026-01-01T00:00:00.000Z',
          summary: 'Execution confirmed.',
          status: 'active',
          metadata: {},
        },
      ],
      invalidations: [
        {
          id: 'inv-1',
          workflowId: 'wf-exec',
          kind:
            'material_price_change',
          status: 'active',
          reason:
            'Material price movement.',
          recordedBy: {
            kind: 'agent',
            id: 'john',
          },
          recordedAt:
            '2026-01-01T00:00:00.000Z',
          metadata: {},
        },
      ],
      metadata: {},
    });

    await expect(
      engine.transition({
        requestId: 'confirm-exec',
        workflowId: 'wf-exec',
        principal: actor(
          'human',
          'ceo',
        ),
        fromState:
          'WAITING_CEO_EXECUTION',
        toState:
          'CEO_EXECUTION_CONFIRMED',
        expectedRevision: 0,
        reason: 'Confirm.',
      }),
    ).rejects.toThrow(
      'active_material_invalidation_blocks_execution_confirmation',
    );
  });

  test('only the human CEO is authorized for financial execution actions', async () => {
    const { engine } = cp();

    const agent =
      await engine.authorizeFinancialAction({
        requestId: 'agent-buy',
        principal: actor(
          'agent',
          'angelo',
        ),
        action: 'buy',
        reason: 'Attempt execution.',
      });

    expect(agent.allowed).toBe(false);

    const ceo =
      await engine.authorizeFinancialAction({
        requestId: 'ceo-buy',
        principal: actor(
          'human',
          'ceo',
        ),
        action: 'buy',
        reason: 'Human execution.',
      });

    expect(ceo.allowed).toBe(true);
  });

  test('duplicate request ids are idempotent', async () => {
    const { engine } =
      await createResearchWorkflow();

    const first =
      await engine.transition({
        requestId: 'same-request',
        workflowId: 'wf-1',
        principal: actor(
          'agent',
          'lauti',
        ),
        fromState: 'DRAFT',
        toState: 'RESEARCHING',
        expectedRevision: 0,
        reason: 'Begin research.',
      });

    const second =
      await engine.transition({
        requestId: 'same-request',
        workflowId: 'wf-1',
        principal: actor(
          'agent',
          'lauti',
        ),
        fromState: 'DRAFT',
        toState: 'RESEARCHING',
        expectedRevision: 0,
        reason: 'Duplicate request.',
      });

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(
      second.workflow.revision,
    ).toBe(first.workflow.revision);
  });

  test('optimistic concurrency rejects stale revisions', async () => {
    const { engine } =
      await createResearchWorkflow();

    await engine.transition({
      requestId: 'first',
      workflowId: 'wf-1',
      principal: actor(
        'agent',
        'lauti',
      ),
      fromState: 'DRAFT',
      toState: 'RESEARCHING',
      expectedRevision: 0,
      reason: 'Begin.',
    });

    await expect(
      engine.registerArtifact({
        requestId: 'stale',
        workflowId: 'wf-1',
        principal: actor(
          'agent',
          'lauti',
        ),
        expectedRevision: 0,
        artifact: {
          id: 'artifact-stale',
          workflowId: 'wf-1',
          kind: 'research_proposal',
          createdBy: {
            kind: 'agent',
            id: 'lauti',
          },
          createdAt:
            '2026-01-01T00:00:00.000Z',
          summary: 'Proposal.',
          metadata: {},
        },
        reason: 'Stale write.',
      }),
    ).rejects.toThrow(
      'workflow_revision_conflict',
    );
  });

  test('control plane creates auditable workflow history', async () => {
    const { engine } =
      await createResearchWorkflow();

    await engine.transition({
      requestId: 'transition-audit',
      workflowId: 'wf-1',
      principal: actor(
        'agent',
        'lauti',
      ),
      fromState: 'DRAFT',
      toState: 'RESEARCHING',
      expectedRevision: 0,
      reason: 'Begin research.',
    });

    const audit =
      await engine.listAudit('wf-1');

    expect(audit.length).toBeGreaterThan(1);

    expect(
      audit.some(
        (record) =>
          record.action ===
            'workflow.transition' &&
          record.outcome ===
            'transitioned',
      ),
    ).toBe(true);
  });
});
