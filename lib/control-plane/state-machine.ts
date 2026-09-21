import type {
  AuthorizationDecision,
  InvestmentWorkflow,
  InvestmentWorkflowState,
} from '@/lib/control-plane/schema';

import {
  INVESTMENT_WORKFLOW_TRANSITIONS,
} from '@/lib/control-plane/spec';

export function canTransitionState(
  from: InvestmentWorkflowState,
  to: InvestmentWorkflowState,
): boolean {
  return INVESTMENT_WORKFLOW_TRANSITIONS[
    from
  ].includes(to);
}

export function assertStateTransitionShape(
  workflow: InvestmentWorkflow,
  from: InvestmentWorkflowState,
  to: InvestmentWorkflowState,
): AuthorizationDecision {
  const missingRequirements: string[] = [];

  if (workflow.state !== from) {
    missingRequirements.push(
      `workflow_state_is_${workflow.state}_not_${from}`,
    );
  }

  if (!canTransitionState(from, to)) {
    missingRequirements.push(
      `transition_not_allowed:${from}->${to}`,
    );
  }

  return {
    allowed: missingRequirements.length === 0,
    reason:
      missingRequirements.length === 0
        ? 'transition_shape_allowed'
        : 'transition_shape_denied',
    missingRequirements,
  };
}
