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
  GovernedCeoDecisionService,
} from '@/lib/control-plane/ceo-decision-service';

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
      'startup-ceo-decisions-',
    ),
  );

  return new SqliteInternalRuntimeStore(
    path.join(
      tempDir,
      'cp.db',
    ),
  );
}

describe('Governed CEO decision service', () => {
  test('CEO research approval records the decision, passes gates and opens risk analysis', async () => {
    const cp = store();

    await cp.createWorkflow({
      id: 'wf-research',
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
      artifacts: [
        {
          id: 'brief-1',
          workflowId:
            'wf-research',
          kind:
            'final_research_brief',
          createdBy: {
            kind: 'agent',
            id: 'beppe',
          },
          createdAt:
            '2026-01-01T00:00:00.000Z',
          summary:
            'Final research brief.',
          status: 'active',
          metadata: {},
        },
      ],
      invalidations: [],
      metadata: {},
    });

    cp.upsertCeoInboxItem({
      inboxId: 'inbox-research',
      handoffId:
        'handoff-research',
      workflowId:
        'wf-research',
      category:
        'approval_request',
      action:
        'decide_research_proposal',
      summary:
        'CEO research decision required.',
      stateAtCreation:
        'WAITING_CEO_RESEARCH_DECISION',
      createdAt:
        '2026-01-01T00:00:00.000Z',
      updatedAt:
        '2026-01-01T00:00:00.000Z',
      policyEvidence: [],
      payload: {},
    });

    let second = 1;

    const service =
      new GovernedCeoDecisionService(
        cp,
        () =>
          `2026-01-01T00:00:0${second++}.000Z`,
      );

    const result =
      await service.decideResearch({
        inboxId:
          'inbox-research',
        decision:
          'approved',
        reason:
          'Research is sufficiently supported to proceed to risk analysis.',
      });

    expect(
      result.workflow.state,
    ).toBe('RISK_ANALYSIS');

    const workflow =
      await cp.getWorkflow(
        'wf-research',
      );

    expect(
      workflow?.artifacts.some(
        (artifact) =>
          artifact.kind ===
            'ceo_research_decision' &&
          artifact.metadata
            .decision ===
            'approved',
      ),
    ).toBe(true);

    expect(
      cp.listCeoInbox()[0],
    ).toMatchObject({
      status: 'resolved',
    });

    cp.close();
  });

  test('CEO research rejection archives the workflow', async () => {
    const cp = store();

    await cp.createWorkflow({
      id: 'wf-reject',
      state:
        'WAITING_CEO_RESEARCH_DECISION',
      revision: 0,
      createdBy: {
        kind: 'agent',
        id: 'pepo',
      },
      createdAt:
        '2026-01-01T00:00:00.000Z',
      updatedAt:
        '2026-01-01T00:00:00.000Z',
      artifacts: [
        {
          id: 'brief-reject',
          workflowId:
            'wf-reject',
          kind:
            'final_research_brief',
          createdBy: {
            kind: 'agent',
            id: 'beppe',
          },
          createdAt:
            '2026-01-01T00:00:00.000Z',
          summary:
            'Final brief.',
          status: 'active',
          metadata: {},
        },
      ],
      invalidations: [],
      metadata: {},
    });

    cp.upsertCeoInboxItem({
      inboxId: 'inbox-reject',
      handoffId:
        'handoff-reject',
      workflowId:
        'wf-reject',
      category:
        'approval_request',
      action:
        'decide_research_proposal',
      summary:
        'Decision required.',
      stateAtCreation:
        'WAITING_CEO_RESEARCH_DECISION',
      createdAt:
        '2026-01-01T00:00:00.000Z',
      updatedAt:
        '2026-01-01T00:00:00.000Z',
      policyEvidence: [],
      payload: {},
    });

    const service =
      new GovernedCeoDecisionService(
        cp,
        () =>
          new Date().toISOString(),
      );

    const result =
      await service.decideResearch({
        inboxId:
          'inbox-reject',
        decision:
          'rejected',
        reason:
          'Proposal rejected after CEO review.',
      });

    expect(
      result.workflow.state,
    ).toBe('ARCHIVED');

    cp.close();
  });

  test('manual execution confirmation records actual execution and starts monitoring', async () => {
    const cp = store();

    await cp.createWorkflow({
      id: 'wf-execution',
      state:
        'WAITING_CEO_EXECUTION',
      revision: 0,
      createdBy: {
        kind: 'agent',
        id: 'lauti',
      },
      createdAt:
        '2026-01-01T00:00:00.000Z',
      updatedAt:
        '2026-01-01T00:00:00.000Z',
      artifacts: [
        {
          id: 'risk-ticket',
          workflowId:
            'wf-execution',
          kind:
            'final_risk_ticket',
          createdBy: {
            kind: 'agent',
            id: 'christian',
          },
          createdAt:
            '2026-01-01T00:00:00.000Z',
          summary:
            'Final risk ticket.',
          status: 'active',
          metadata: {},
        },
      ],
      invalidations: [],
      metadata: {},
    });

    cp.upsertCeoInboxItem({
      inboxId:
        'inbox-execution',
      handoffId:
        'handoff-execution',
      workflowId:
        'wf-execution',
      category:
        'approval_request',
      action:
        'perform_manual_execution_decision',
      summary:
        'Manual execution decision.',
      stateAtCreation:
        'WAITING_CEO_EXECUTION',
      createdAt:
        '2026-01-01T00:00:00.000Z',
      updatedAt:
        '2026-01-01T00:00:00.000Z',
      policyEvidence: [],
      payload: {},
    });

    let second = 1;

    const service =
      new GovernedCeoDecisionService(
        cp,
        () =>
          `2026-01-01T00:00:0${second++}.000Z`,
      );

    const result =
      await service.confirmManualExecution({
        inboxId:
          'inbox-execution',
        executionPrice: 101.25,
        quantity: 4,
        fees: 1.5,
        currency: 'EUR',
      });

    expect(
      result.workflow.state,
    ).toBe('MONITORING');

    const workflow =
      await cp.getWorkflow(
        'wf-execution',
      );

    const confirmation =
      workflow?.artifacts.find(
        (artifact) =>
          artifact.kind ===
          'ceo_execution_confirmation',
      );

    expect(
      confirmation?.metadata,
    ).toMatchObject({
      manualExecutionConfirmed:
        true,
      executionPrice:
        101.25,
      quantity: 4,
      fees: 1.5,
      currency: 'EUR',
    });

    cp.close();
  });

  test('active material invalidation blocks execution confirmation before an artifact is written', async () => {
    const cp = store();

    await cp.createWorkflow({
      id: 'wf-blocked',
      state:
        'WAITING_CEO_EXECUTION',
      revision: 0,
      createdBy: {
        kind: 'agent',
        id: 'andy',
      },
      createdAt:
        '2026-01-01T00:00:00.000Z',
      updatedAt:
        '2026-01-01T00:00:00.000Z',
      artifacts: [
        {
          id: 'risk-ticket',
          workflowId:
            'wf-blocked',
          kind:
            'final_risk_ticket',
          createdBy: {
            kind: 'agent',
            id: 'christian',
          },
          createdAt:
            '2026-01-01T00:00:00.000Z',
          summary:
            'Final risk ticket.',
          status: 'active',
          metadata: {},
        },
      ],
      invalidations: [
        {
          id: 'inv-1',
          workflowId:
            'wf-blocked',
          kind:
            'material_news_change',
          status: 'active',
          reason:
            'Material new information.',
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

    cp.upsertCeoInboxItem({
      inboxId:
        'inbox-blocked',
      handoffId:
        'handoff-blocked',
      workflowId:
        'wf-blocked',
      category:
        'approval_request',
      action:
        'perform_manual_execution_decision',
      summary:
        'Manual execution decision.',
      stateAtCreation:
        'WAITING_CEO_EXECUTION',
      createdAt:
        '2026-01-01T00:00:00.000Z',
      updatedAt:
        '2026-01-01T00:00:00.000Z',
      policyEvidence: [],
      payload: {},
    });

    const service =
      new GovernedCeoDecisionService(
        cp,
      );

    await expect(
      service.confirmManualExecution({
        inboxId:
          'inbox-blocked',
        executionPrice: 100,
        quantity: 1,
      }),
    ).rejects.toThrow(
      'active_material_invalidation_blocks_execution_confirmation',
    );

    const workflow =
      await cp.getWorkflow(
        'wf-blocked',
      );

    expect(
      workflow?.artifacts.filter(
        (artifact) =>
          artifact.kind ===
          'ceo_execution_confirmation',
      ),
    ).toHaveLength(0);

    cp.close();
  });
});
