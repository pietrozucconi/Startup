import type {
  AuthorizationDecision,
  ControlPlanePrincipal,
  FinancialAction,
  InvestmentWorkflowState,
  WorkflowArtifactKind,
} from '@/lib/control-plane/schema';

import {
  ARTIFACT_AUTHORS,
  CEO_GATED_SOURCE_STATES,
  CEO_ID,
  MONITORING_AGENT_IDS,
  MONITORING_STATES,
  RESEARCH_AGENT_IDS,
  RESEARCH_STATES,
  RISK_AGENT_IDS,
  RISK_STATES,
  MATERIAL_INVALIDATION_RECORDER_IDS,
} from '@/lib/control-plane/spec';

function allow(reason: string): AuthorizationDecision {
  return {
    allowed: true,
    reason,
    missingRequirements: [],
  };
}

function deny(
  reason: string,
  missingRequirements: string[] = [],
): AuthorizationDecision {
  return {
    allowed: false,
    reason,
    missingRequirements,
  };
}

export function isCeo(
  principal: ControlPlanePrincipal,
): boolean {
  return (
    principal.actor.kind === 'human' &&
    principal.actor.id === CEO_ID
  );
}

export function isControlPlaneInternal(
  principal: ControlPlanePrincipal,
): boolean {
  return (
    principal.actor.kind === 'control_plane' ||
    principal.actor.kind === 'system'
  );
}

function inIds(
  id: string,
  ids: readonly string[],
): boolean {
  return ids.includes(id);
}

export function canCreateInvestmentWorkflow(
  principal: ControlPlanePrincipal,
  responsibleResearchAgentId?: string,
): AuthorizationDecision {
  if (isControlPlaneInternal(principal)) {
    return allow('control_plane_may_create_workflow');
  }

  if (
    principal.actor.kind === 'agent' &&
    inIds(
      principal.actor.id,
      ['lauti', 'pepo', 'andy'],
    ) &&
    (
      responsibleResearchAgentId === undefined ||
      responsibleResearchAgentId === principal.actor.id
    )
  ) {
    return allow(
      'authorized_research_preparer_may_request_workflow_creation',
    );
  }

  if (isCeo(principal)) {
    return allow(
      'ceo_ultimate_authority_may_request_workflow_creation',
    );
  }

  return deny(
    'principal_not_authorized_to_create_investment_workflow',
  );
}

export function canRegisterArtifact(
  principal: ControlPlanePrincipal,
  kind: WorkflowArtifactKind,
): AuthorizationDecision {
  if (isControlPlaneInternal(principal)) {
    return allow(
      'control_plane_internal_artifact_registration_allowed',
    );
  }

  const allowedIds = ARTIFACT_AUTHORS[kind];

  if (
    allowedIds.includes(principal.actor.id)
  ) {
    return allow(
      `artifact_author_allowed:${kind}`,
    );
  }

  return deny(
    `artifact_author_denied:${kind}`,
  );
}

export function canRequestTransition(
  principal: ControlPlanePrincipal,
  from: InvestmentWorkflowState,
): AuthorizationDecision {
  if (isControlPlaneInternal(principal)) {
    return allow(
      'control_plane_internal_transition_request_allowed',
    );
  }

  if (CEO_GATED_SOURCE_STATES.has(from)) {
    return isCeo(principal)
      ? allow('ceo_gated_transition_allowed')
      : deny('ceo_required_for_transition');
  }

  if (isCeo(principal)) {
    return allow(
      'ceo_may_request_transition_subject_to_all_gates',
    );
  }

  if (principal.actor.kind !== 'agent') {
    return deny(
      'non_agent_principal_not_authorized_for_stage_transition',
    );
  }

  if (
    RESEARCH_STATES.has(from) &&
    inIds(principal.actor.id, RESEARCH_AGENT_IDS)
  ) {
    return allow(
      'research_stage_transition_request_allowed',
    );
  }

  if (
    RISK_STATES.has(from) &&
    inIds(principal.actor.id, RISK_AGENT_IDS)
  ) {
    return allow(
      'risk_stage_transition_request_allowed',
    );
  }

  if (
    MONITORING_STATES.has(from) &&
    inIds(
      principal.actor.id,
      MONITORING_AGENT_IDS,
    )
  ) {
    return allow(
      'monitoring_stage_transition_request_allowed',
    );
  }

  return deny(
    'principal_department_not_authorized_for_current_stage',
  );
}

export function canRecordMaterialInvalidation(
  principal: ControlPlanePrincipal,
): AuthorizationDecision {
  if (isControlPlaneInternal(principal)) {
    return allow(
      'control_plane_internal_invalidation_allowed',
    );
  }

  if (
    principal.actor.kind === 'agent' &&
    inIds(
      principal.actor.id,
      MATERIAL_INVALIDATION_RECORDER_IDS,
    )
  ) {
    return allow(
      'authorized_risk_or_monitoring_agent_may_record_invalidation',
    );
  }

  if (isCeo(principal)) {
    return allow(
      'ceo_may_record_material_invalidation',
    );
  }

  return deny(
    'principal_not_authorized_to_record_material_invalidation',
  );
}

export function canResolveMaterialInvalidation(
  principal: ControlPlanePrincipal,
): AuthorizationDecision {
  if (isControlPlaneInternal(principal)) {
    return allow(
      'control_plane_internal_invalidation_resolution_allowed',
    );
  }

  if (
    principal.actor.kind === 'agent' &&
    principal.actor.id === 'christian'
  ) {
    return allow(
      'final_risk_supervisor_may_request_invalidation_resolution',
    );
  }

  if (isCeo(principal)) {
    return allow(
      'ceo_may_request_invalidation_resolution',
    );
  }

  return deny(
    'principal_not_authorized_to_resolve_material_invalidation',
  );
}

export function canAuthorizeFinancialAction(
  principal: ControlPlanePrincipal,
  _action: FinancialAction,
): AuthorizationDecision {
  if (isCeo(principal)) {
    return allow(
      'financial_execution_reserved_for_human_ceo',
    );
  }

  return deny(
    'financial_execution_reserved_for_human_ceo',
  );
}
