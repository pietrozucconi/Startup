import type {
  AuthorizationDecision,
  InvestmentWorkflow,
  InvestmentWorkflowState,
  WorkflowArtifact,
} from '@/lib/control-plane/schema';

function activeArtifacts(
  workflow: InvestmentWorkflow,
): WorkflowArtifact[] {
  return workflow.artifacts.filter(
    (artifact) => artifact.status === 'active',
  );
}

function hasArtifact(
  workflow: InvestmentWorkflow,
  kind: WorkflowArtifact['kind'],
  options: {
    authorId?: string;
    metadataEquals?: Record<string, unknown>;
  } = {},
): boolean {
  return activeArtifacts(workflow).some(
    (artifact) => {
      if (artifact.kind !== kind) {
        return false;
      }

      if (
        options.authorId &&
        artifact.createdBy.id !== options.authorId
      ) {
        return false;
      }

      if (options.metadataEquals) {
        for (const [
          key,
          value,
        ] of Object.entries(
          options.metadataEquals,
        )) {
          if (artifact.metadata[key] !== value) {
            return false;
          }
        }
      }

      return true;
    },
  );
}

function missing(
  requirements: string[],
): AuthorizationDecision {
  return {
    allowed: requirements.length === 0,
    reason:
      requirements.length === 0
        ? 'workflow_gates_satisfied'
        : 'workflow_gates_not_satisfied',
    missingRequirements: requirements,
  };
}

export function evaluateWorkflowGates(
  workflow: InvestmentWorkflow,
  from: InvestmentWorkflowState,
  to: InvestmentWorkflowState,
): AuthorizationDecision {
  const requirements: string[] = [];

  const require = (
    condition: boolean,
    code: string,
  ) => {
    if (!condition) {
      requirements.push(code);
    }
  };

  if (
    from === 'RESEARCHING' &&
    to === 'READY_FOR_RED_DESK'
  ) {
    require(
      hasArtifact(
        workflow,
        'research_proposal',
      ),
      'research_proposal_required',
    );
  }

  if (
    from === 'UNDER_CRITICAL_REVIEW' &&
    to ===
      'READY_FOR_FINAL_RESEARCH_SUPERVISOR'
  ) {
    require(
      hasArtifact(
        workflow,
        'red_desk_review',
        { authorId: 'yann' },
      ),
      'yann_red_desk_review_required',
    );
  }

  if (
    from ===
      'READY_FOR_FINAL_RESEARCH_SUPERVISOR' &&
    to === 'WAITING_CEO_RESEARCH_DECISION'
  ) {
    require(
      hasArtifact(
        workflow,
        'final_research_brief',
        { authorId: 'beppe' },
      ),
      'beppe_final_research_brief_required',
    );
  }

  if (
    from === 'WAITING_CEO_RESEARCH_DECISION' &&
    to === 'CEO_RESEARCH_APPROVED'
  ) {
    require(
      hasArtifact(
        workflow,
        'ceo_research_decision',
        {
          authorId: 'ceo',
          metadataEquals: {
            decision: 'approved',
          },
        },
      ),
      'ceo_research_approval_record_required',
    );
  }

  if (
    from === 'WAITING_CEO_RESEARCH_DECISION' &&
    to === 'CEO_RESEARCH_REJECTED'
  ) {
    require(
      hasArtifact(
        workflow,
        'ceo_research_decision',
        {
          authorId: 'ceo',
          metadataEquals: {
            decision: 'rejected',
          },
        },
      ),
      'ceo_research_rejection_record_required',
    );
  }

  if (
    from === 'CEO_RESEARCH_APPROVED' &&
    to === 'RISK_ANALYSIS'
  ) {
    require(
      hasArtifact(
        workflow,
        'ceo_research_decision',
        {
          authorId: 'ceo',
          metadataEquals: {
            decision: 'approved',
          },
        },
      ),
      'approved_ceo_research_decision_required',
    );
  }

  if (
    from === 'RISK_ANALYSIS' &&
    to === 'RISK_REVIEW'
  ) {
    require(
      hasArtifact(
        workflow,
        'portfolio_risk_assessment',
        { authorId: 'manuel' },
      ),
      'manuel_portfolio_risk_assessment_required',
    );

    require(
      hasArtifact(
        workflow,
        'trade_structure',
        { authorId: 'dimash' },
      ),
      'dimash_trade_structure_required',
    );

    require(
      hasArtifact(
        workflow,
        'liquidity_event_assessment',
        { authorId: 'bare' },
      ),
      'bare_liquidity_event_assessment_required',
    );

    require(
      hasArtifact(
        workflow,
        'broker_execution_instructions',
        { authorId: 'angelo' },
      ),
      'angelo_broker_execution_instructions_required',
    );
  }

  if (
    from === 'RISK_REVIEW' &&
    to === 'RISK_APPROVED'
  ) {
    require(
      hasArtifact(
        workflow,
        'independent_risk_verdict',
        {
          authorId: 'pio',
          metadataEquals: {
            verdict: 'Approved',
          },
        },
      ),
      'pio_approved_verdict_required',
    );

    require(
      hasArtifact(
        workflow,
        'final_risk_ticket',
        { authorId: 'christian' },
      ),
      'christian_final_risk_ticket_required',
    );
  }

  if (
    from === 'RISK_REVIEW' &&
    to === 'RISK_MODIFICATION_REQUIRED'
  ) {
    require(
      hasArtifact(
        workflow,
        'independent_risk_verdict',
        {
          authorId: 'pio',
          metadataEquals: {
            verdict:
              'Approved_with_Modifications',
          },
        },
      ),
      'pio_modification_verdict_required',
    );
  }

  if (
    from === 'RISK_REVIEW' &&
    to === 'RISK_REJECTED'
  ) {
    require(
      hasArtifact(
        workflow,
        'independent_risk_verdict',
        {
          authorId: 'pio',
          metadataEquals: {
            verdict: 'Rejected',
          },
        },
      ),
      'pio_rejection_verdict_required',
    );
  }

  if (
    from === 'RISK_APPROVED' &&
    to === 'WAITING_CEO_EXECUTION'
  ) {
    require(
      hasArtifact(
        workflow,
        'final_risk_ticket',
        { authorId: 'christian' },
      ),
      'final_risk_ticket_required',
    );
  }

  if (
    from === 'WAITING_CEO_EXECUTION' &&
    to === 'CEO_EXECUTION_CONFIRMED'
  ) {
    require(
      hasArtifact(
        workflow,
        'ceo_execution_confirmation',
        { authorId: 'ceo' },
      ),
      'ceo_execution_confirmation_required',
    );

    require(
      !workflow.invalidations.some(
        (invalidation) =>
          invalidation.status === 'active',
      ),
      'active_material_invalidation_blocks_execution_confirmation',
    );
  }

  if (
    from === 'CEO_EXECUTION_CONFIRMED' &&
    to === 'MONITORING'
  ) {
    require(
      hasArtifact(
        workflow,
        'ceo_execution_confirmation',
        { authorId: 'ceo' },
      ),
      'execution_confirmation_record_required',
    );
  }

  if (
    from === 'POST_MORTEM' &&
    to === 'ARCHIVED'
  ) {
    require(
      hasArtifact(
        workflow,
        'post_mortem',
      ),
      'post_mortem_record_required',
    );
  }

  return missing(requirements);
}
