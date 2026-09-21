import {
  describe,
  expect,
  test,
} from 'vitest';

import {
  canTransitionState,
} from '@/lib/control-plane/state-machine';

import {
  INVESTMENT_WORKFLOW_TRANSITIONS,
  NUMERIC_RISK_LIMITS_DEFINED,
} from '@/lib/control-plane/spec';

describe('Company Control Plane state machine', () => {
  test('matches canonical investment workflow transitions', () => {
    expect(
      INVESTMENT_WORKFLOW_TRANSITIONS.DRAFT,
    ).toEqual(['RESEARCHING']);

    expect(
      INVESTMENT_WORKFLOW_TRANSITIONS
        .WAITING_CEO_RESEARCH_DECISION,
    ).toEqual([
      'CEO_RESEARCH_REJECTED',
      'CEO_RESEARCH_APPROVED',
    ]);

    expect(
      INVESTMENT_WORKFLOW_TRANSITIONS.RISK_REVIEW,
    ).toEqual([
      'RISK_REJECTED',
      'RISK_MODIFICATION_REQUIRED',
      'RISK_APPROVED',
    ]);

    expect(
      INVESTMENT_WORKFLOW_TRANSITIONS.ARCHIVED,
    ).toEqual([]);
  });

  test('rejects skipped workflow transitions', () => {
    expect(
      canTransitionState(
        'DRAFT',
        'RISK_APPROVED',
      ),
    ).toBe(false);

    expect(
      canTransitionState(
        'WAITING_CEO_EXECUTION',
        'MONITORING',
      ),
    ).toBe(false);
  });

  test('does not invent numerical risk limits', () => {
    expect(
      NUMERIC_RISK_LIMITS_DEFINED,
    ).toBe(false);
  });
});
