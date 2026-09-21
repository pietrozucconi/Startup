import {
  describe,
  expect,
  test,
} from 'vitest';

import type {
  ControlPlaneOutboxMessage,
} from '@/lib/control-plane/durable-schema';

import {
  planGovernedHandoffs,
} from '@/lib/control-plane/handoff-policy';

import type {
  InvestmentWorkflow,
} from '@/lib/control-plane/schema';

const retryPolicy = {
  maxAttempts: 5,
  initialDelayMs: 1_000,
  backoffMultiplier: 2,
  maxDelayMs: 60_000,
  timeoutMs: 30_000,
};

function workflow(
  state: InvestmentWorkflow['state'],
): InvestmentWorkflow {
  return {
    id: 'wf-1',
    state,
    revision: 4,
    createdBy: {
      kind: 'agent',
      id: 'lauti',
    },
    createdAt:
      '2026-01-01T00:00:00.000Z',
    updatedAt:
      '2026-01-01T00:04:00.000Z',
    responsibleResearchAgentId:
      'lauti',
    artifacts: [],
    invalidations: [],
    metadata: {},
  };
}

function transitionMessage(
  fromState:
    InvestmentWorkflow['state'],
  toState:
    InvestmentWorkflow['state'],
): ControlPlaneOutboxMessage {
  return {
    messageId:
      `msg:${fromState}:${toState}`,
    topic:
      'control-plane.workflow.transitioned',
    partitionKey: 'wf-1',
    workflowId: 'wf-1',
    status: 'pending',
    attempts: 0,
    createdAt:
      '2026-01-01T00:04:00.000Z',
    availableAt:
      '2026-01-01T00:04:00.000Z',
    retryPolicy,
    payload: {
      eventId: 'event-1',
      eventType:
        'workflow_transitioned',
      fromState,
      toState,
    },
  };
}

describe('Governed handoff policy', () => {
  test('routes READY_FOR_RED_DESK to Yann', () => {
    const handoffs =
      planGovernedHandoffs({
        message: transitionMessage(
          'RESEARCHING',
          'READY_FOR_RED_DESK',
        ),
        workflow: workflow(
          'READY_FOR_RED_DESK',
        ),
      });

    expect(handoffs).toHaveLength(1);

    expect(
      handoffs[0],
    ).toMatchObject({
      kind: 'agent_task',
      destination: {
        kind: 'agent',
        id: 'yann',
      },
      action:
        'perform_red_desk_review',
    });
  });

  test('CEO research handoff requires Beppe final brief', () => {
    const current = workflow(
      'WAITING_CEO_RESEARCH_DECISION',
    );

    expect(() =>
      planGovernedHandoffs({
        message: transitionMessage(
          'READY_FOR_FINAL_RESEARCH_SUPERVISOR',
          'WAITING_CEO_RESEARCH_DECISION',
        ),
        workflow: current,
      }),
    ).toThrow(
      'beppe_final_research_brief_required_before_ceo_handoff',
    );

    current.artifacts.push({
      id: 'brief-1',
      workflowId: 'wf-1',
      kind: 'final_research_brief',
      createdBy: {
        kind: 'agent',
        id: 'beppe',
      },
      createdAt:
        '2026-01-01T00:03:00.000Z',
      summary: 'Final brief.',
      status: 'active',
      metadata: {},
    });

    const handoffs =
      planGovernedHandoffs({
        message: transitionMessage(
          'READY_FOR_FINAL_RESEARCH_SUPERVISOR',
          'WAITING_CEO_RESEARCH_DECISION',
        ),
        workflow: current,
      });

    expect(handoffs).toHaveLength(1);

    expect(
      handoffs[0],
    ).toMatchObject({
      kind:
        'ceo_approval_request',
      destination: {
        kind: 'human',
        id: 'ceo',
      },
      action:
        'decide_research_proposal',
    });
  });

  test('routes risk analysis to all four mandatory analysts', () => {
    const handoffs =
      planGovernedHandoffs({
        message: transitionMessage(
          'CEO_RESEARCH_APPROVED',
          'RISK_ANALYSIS',
        ),
        workflow: workflow(
          'RISK_ANALYSIS',
        ),
      });

    expect(
      handoffs.map(
        (handoff) =>
          handoff.destination.id,
      ),
    ).toEqual([
      'manuel',
      'dimash',
      'bare',
      'angelo',
    ]);
  });

  test('never creates an automatic broker execution handoff', () => {
    const message: ControlPlaneOutboxMessage = {
      messageId: 'financial-1',
      topic:
        'control-plane.financial-action.authorized',
      partitionKey: 'financial-1',
      status: 'pending',
      attempts: 0,
      createdAt:
        '2026-01-01T00:00:00.000Z',
      availableAt:
        '2026-01-01T00:00:00.000Z',
      retryPolicy,
      payload: {
        eventId: 'event-financial',
        eventType:
          'financial_action_authorized',
        financialAction: 'buy',
        allowed: true,
      },
    };

    expect(
      planGovernedHandoffs({
        message,
      }),
    ).toEqual([]);
  });

  test('routes denied financial execution to a CEO security alert', () => {
    const message: ControlPlaneOutboxMessage = {
      messageId: 'financial-denied',
      topic:
        'control-plane.financial-action.denied',
      partitionKey:
        'financial-denied',
      status: 'pending',
      attempts: 0,
      createdAt:
        '2026-01-01T00:00:00.000Z',
      availableAt:
        '2026-01-01T00:00:00.000Z',
      retryPolicy,
      payload: {
        eventId:
          'event-financial-denied',
        eventType:
          'financial_action_denied',
        financialAction: 'buy',
        allowed: false,
      },
    };

    const handoffs =
      planGovernedHandoffs({
        message,
      });

    expect(handoffs).toHaveLength(1);

    expect(
      handoffs[0],
    ).toMatchObject({
      kind: 'security_alert',
      destination: {
        kind: 'human',
        id: 'ceo',
      },
    });
  });
});
