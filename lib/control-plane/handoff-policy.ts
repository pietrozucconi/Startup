import { z } from 'zod';

import type {
  ControlPlaneOutboxMessage,
} from '@/lib/control-plane/durable-schema';

import {
  InvestmentWorkflowStateSchema,
  WorkflowArtifactKindSchema,
  type InvestmentWorkflow,
  type InvestmentWorkflowState,
} from '@/lib/control-plane/schema';

import {
  canTransitionState,
} from '@/lib/control-plane/state-machine';

import type {
  GovernedHandoffInput,
  GovernedHandoffKind,
  HandoffDestination,
} from '@/lib/control-plane/handoff-schema';

const DEFAULT_HANDOFF_RETRY_POLICY = {
  maxAttempts: 5,
  initialDelayMs: 1_000,
  backoffMultiplier: 2,
  maxDelayMs: 60_000,
  timeoutMs: 30_000,
} as const;

export const CONTROL_PLANE_ROUTABLE_TOPICS = [
  'control-plane.workflow.created',
  'control-plane.artifact.registered',
  'control-plane.workflow.transitioned',
  'control-plane.invalidation.recorded',
  'control-plane.invalidation.resolved',
  'control-plane.financial-action.authorized',
  'control-plane.financial-action.denied',
] as const;

const TransitionPayloadSchema = z.object({
  eventId: z.string().min(1),
  eventType: z.literal(
    'workflow_transitioned',
  ),
  fromState:
    InvestmentWorkflowStateSchema,
  toState:
    InvestmentWorkflowStateSchema,
});

const ArtifactPayloadSchema = z.object({
  eventId: z.string().min(1),
  eventType: z.literal(
    'artifact_registered',
  ),
  artifactId: z.string().min(1),
  artifactKind:
    WorkflowArtifactKindSchema,
});

const InvalidationRecordedPayloadSchema =
  z.object({
    eventId: z.string().min(1),
    eventType: z.literal(
      'invalidation_recorded',
    ),
    invalidationId: z.string().min(1),
    invalidationKind:
      z.string().min(1),
  });

const InvalidationResolvedPayloadSchema =
  z.object({
    eventId: z.string().min(1),
    eventType: z.literal(
      'invalidation_resolved',
    ),
    invalidationId: z.string().min(1),
  });

const FinancialPayloadSchema = z.object({
  eventId: z.string().min(1),
  eventType: z.enum([
    'financial_action_authorized',
    'financial_action_denied',
  ]),
  financialAction: z.string().min(1),
  allowed: z.boolean(),
});

function destinationKey(
  destination: HandoffDestination,
): string {
  return `${destination.kind}:${destination.id}`;
}

function sanitizeIdPart(
  value: string,
): string {
  return value.replace(
    /[^a-zA-Z0-9_.:-]/g,
    '_',
  );
}

function handoffId(input: {
  messageId: string;
  destination: HandoffDestination;
  action: string;
}): string {
  return [
    'handoff',
    sanitizeIdPart(input.messageId),
    sanitizeIdPart(
      destinationKey(
        input.destination,
      ),
    ),
    sanitizeIdPart(input.action),
  ].join(':');
}

function makeHandoff(input: {
  message: ControlPlaneOutboxMessage;
  workflow?: InvestmentWorkflow;
  stateAtEvent?: InvestmentWorkflowState;
  kind: GovernedHandoffKind;
  destination: HandoffDestination;
  action: string;
  summary: string;
  policyEvidence: string[];
  payload?: Record<string, unknown>;
}): GovernedHandoffInput {
  return {
    handoffId: handoffId({
      messageId:
        input.message.messageId,
      destination:
        input.destination,
      action: input.action,
    }),
    sourceMessageId:
      input.message.messageId,
    sourceTopic:
      input.message.topic,
    workflowId:
      input.workflow?.id ??
      input.message.workflowId,
    stateAtEvent:
      input.stateAtEvent,
    kind: input.kind,
    destination:
      input.destination,
    action: input.action,
    summary: input.summary,
    createdAt:
      input.message.createdAt,
    availableAt:
      input.message.availableAt,
    retryPolicy:
      DEFAULT_HANDOFF_RETRY_POLICY,
    policyEvidence:
      input.policyEvidence,
    payload: {
      ...input.message.payload,
      ...(input.payload ?? {}),
    },
  };
}

function activeArtifact(
  workflow: InvestmentWorkflow,
  kind: InvestmentWorkflow['artifacts'][number]['kind'],
  authorId?: string,
) {
  return workflow.artifacts.find(
    (artifact) =>
      artifact.kind === kind &&
      artifact.status === 'active' &&
      (
        authorId === undefined ||
        artifact.createdBy.id ===
          authorId
      ),
  );
}

function requireArtifact(
  workflow: InvestmentWorkflow,
  kind: InvestmentWorkflow['artifacts'][number]['kind'],
  authorId: string,
  reason: string,
): void {
  if (
    !activeArtifact(
      workflow,
      kind,
      authorId,
    )
  ) {
    throw new Error(
      `handoff_policy_precondition_failed:${reason}`,
    );
  }
}

function agentTask(
  message: ControlPlaneOutboxMessage,
  workflow: InvestmentWorkflow,
  stateAtEvent: InvestmentWorkflowState,
  agentId: string,
  action: string,
  summary: string,
  evidence: string[],
  payload: Record<string, unknown> = {},
): GovernedHandoffInput {
  return makeHandoff({
    message,
    workflow,
    stateAtEvent,
    kind: 'agent_task',
    destination: {
      kind: 'agent',
      id: agentId,
    },
    action,
    summary,
    policyEvidence: evidence,
    payload,
  });
}

function monitoringTask(
  message: ControlPlaneOutboxMessage,
  workflow: InvestmentWorkflow,
  stateAtEvent: InvestmentWorkflowState,
  agentId: string,
  action: string,
  summary: string,
  evidence: string[],
): GovernedHandoffInput {
  return makeHandoff({
    message,
    workflow,
    stateAtEvent,
    kind: 'monitoring_task',
    destination: {
      kind: 'agent',
      id: agentId,
    },
    action,
    summary,
    policyEvidence: evidence,
  });
}

function memoryCandidate(
  message: ControlPlaneOutboxMessage,
  workflow: InvestmentWorkflow,
  stateAtEvent: InvestmentWorkflowState,
  action: string,
  summary: string,
  evidence: string[],
): GovernedHandoffInput {
  return makeHandoff({
    message,
    workflow,
    stateAtEvent,
    kind: 'memory_candidate',
    destination: {
      kind: 'startup_brain',
      id: 'startup-brain',
    },
    action,
    summary,
    policyEvidence: evidence,
    payload: {
      memoryPolicy:
        'candidate_only_no_automatic_permanent_commit',
    },
  });
}

function planTransitionHandoffs(
  message: ControlPlaneOutboxMessage,
  workflow: InvestmentWorkflow,
): GovernedHandoffInput[] {
  const payload =
    TransitionPayloadSchema.parse(
      message.payload,
    );

  if (
    !canTransitionState(
      payload.fromState,
      payload.toState,
    )
  ) {
    throw new Error(
      `handoff_noncanonical_transition:${payload.fromState}->${payload.toState}`,
    );
  }

  const to = payload.toState;
  const result: GovernedHandoffInput[] =
    [];

  switch (to) {
    case 'DRAFT':
      break;

    case 'RESEARCHING':
      if (
        workflow.responsibleResearchAgentId
      ) {
        result.push(
          agentTask(
            message,
            workflow,
            to,
            workflow.responsibleResearchAgentId,
            'continue_research',
            'Continue the governed investment research workflow.',
            [
              'workflow:DRAFT->RESEARCHING',
              'research_preparation_owned_by_responsible_researcher',
            ],
          ),
        );
      }
      break;

    case 'READY_FOR_RED_DESK':
      result.push(
        agentTask(
          message,
          workflow,
          to,
          'yann',
          'perform_red_desk_review',
          'Critically review the research proposal without rewriting the original proposal.',
          [
            'mandatory_review:yann',
            'red_desk_cannot_rewrite_original_proposals',
          ],
        ),
      );
      break;

    case 'UNDER_CRITICAL_REVIEW':
      break;

    case 'READY_FOR_FINAL_RESEARCH_SUPERVISOR':
      requireArtifact(
        workflow,
        'red_desk_review',
        'yann',
        'yann_red_desk_review_required_before_beppe_handoff',
      );

      result.push(
        agentTask(
          message,
          workflow,
          to,
          'beppe',
          'prepare_final_research_brief',
          'Consolidate the proposal and Red Desk objections for CEO review.',
          [
            'mandatory_review:beppe',
            'research_ceo_interface:beppe',
          ],
        ),
      );
      break;

    case 'WAITING_CEO_RESEARCH_DECISION':
      requireArtifact(
        workflow,
        'final_research_brief',
        'beppe',
        'beppe_final_research_brief_required_before_ceo_handoff',
      );

      result.push(
        makeHandoff({
          message,
          workflow,
          stateAtEvent: to,
          kind:
            'ceo_approval_request',
          destination: {
            kind: 'human',
            id: 'ceo',
          },
          action:
            'decide_research_proposal',
          summary:
            'Review the final research brief and approve or reject the proposal for risk analysis.',
          policyEvidence: [
            'research_final_decision:ceo',
            'research_ceo_interface:beppe',
            'ceo_research_approval_authorizes_risk_analysis_only',
          ],
        }),
      );
      break;

    case 'CEO_RESEARCH_REJECTED':
      result.push(
        memoryCandidate(
          message,
          workflow,
          to,
          'capture_rejected_research_decision',
          'Consider the rejected research proposal and rationale as an institutional-memory candidate.',
          [
            'memory:preserve_decisions',
            'memory:learn_from_failures_and_neutral_outcomes',
          ],
        ),
      );
      break;

    case 'CEO_RESEARCH_APPROVED':
      result.push(
        memoryCandidate(
          message,
          workflow,
          to,
          'capture_ceo_research_decision',
          'Consider the CEO research approval as a contextualized institutional-memory candidate.',
          [
            'memory:preserve_decisions',
            'no_single_event_automatic_generalization',
          ],
        ),
      );
      break;

    case 'RISK_ANALYSIS':
      for (const [
        agentId,
        action,
        summary,
      ] of [
        [
          'manuel',
          'analyze_portfolio_risk',
          'Assess portfolio-level risk and maximum permissible allocation under approved policy.',
        ],
        [
          'dimash',
          'structure_trade',
          'Structure entry, sizing, stop, targets, duration and risk/reward.',
        ],
        [
          'bare',
          'analyze_liquidity_and_events',
          'Assess liquidity, execution quality and material event risk.',
        ],
        [
          'angelo',
          'prepare_broker_neutral_instructions',
          'Translate the financial plan into broker-neutral manual execution instructions.',
        ],
      ] as const) {
        result.push(
          agentTask(
            message,
            workflow,
            to,
            agentId,
            action,
            summary,
            [
              `mandatory_risk_analysis:${agentId}`,
              'agents_cannot_execute_trades',
            ],
          ),
        );
      }
      break;

    case 'RISK_REVIEW':
      result.push(
        agentTask(
          message,
          workflow,
          to,
          'pio',
          'perform_independent_risk_review',
          'Independently review the complete risk plan and issue the governed verdict.',
          [
            'independent_risk_review:pio',
            'pio_cannot_directly_modify_reviewed_plan',
          ],
        ),
      );
      break;

    case 'RISK_REJECTED':
      result.push(
        memoryCandidate(
          message,
          workflow,
          to,
          'capture_risk_rejection',
          'Consider the rejected risk plan and independent review as an institutional-memory candidate.',
          [
            'memory:learn_from_failures',
            'memory:preserve_risk_reviews',
          ],
        ),
      );
      break;

    case 'RISK_MODIFICATION_REQUIRED':
      for (const agentId of [
        'manuel',
        'dimash',
        'bare',
        'angelo',
      ] as const) {
        result.push(
          agentTask(
            message,
            workflow,
            to,
            agentId,
            'revise_risk_plan',
            'Revise the risk plan in response to the independent review without bypassing governance.',
            [
              'risk_review:modification_required',
              'risk_modification_returns_to_risk_analysis',
            ],
          ),
        );
      }

      result.push(
        memoryCandidate(
          message,
          workflow,
          to,
          'capture_risk_modification_requirement',
          'Consider the required risk-plan correction and its cause as an institutional-memory candidate.',
          [
            'memory:preserve_reviews',
            'memory:preserve_disagreements',
          ],
        ),
      );
      break;

    case 'RISK_APPROVED':
      result.push(
        memoryCandidate(
          message,
          workflow,
          to,
          'capture_risk_approval',
          'Consider the approved risk structure and review evidence as an institutional-memory candidate.',
          [
            'memory:preserve_risk_reviews',
            'memory:preserve_decisions',
          ],
        ),
      );
      break;

    case 'WAITING_CEO_EXECUTION':
      requireArtifact(
        workflow,
        'final_risk_ticket',
        'christian',
        'christian_final_risk_ticket_required_before_ceo_execution_handoff',
      );

      result.push(
        makeHandoff({
          message,
          workflow,
          stateAtEvent: to,
          kind:
            'ceo_approval_request',
          destination: {
            kind: 'human',
            id: 'ceo',
          },
          action:
            'perform_manual_execution_decision',
          summary:
            'Review the definitive Trade Execution Ticket and decide whether to execute manually.',
          policyEvidence: [
            'execution_actor:ceo',
            'risk_ceo_interface:christian',
            'agents_allowed_execution:false',
          ],
        }),
      );
      break;

    case 'CEO_EXECUTION_CONFIRMED':
      result.push(
        memoryCandidate(
          message,
          workflow,
          to,
          'capture_execution_confirmation',
          'Consider the human execution confirmation as a decision-history memory candidate.',
          [
            'memory:preserve_decisions',
            'audit:preserve_execution_confirmation',
          ],
        ),
      );
      break;

    case 'MONITORING':
      requireArtifact(
        workflow,
        'ceo_execution_confirmation',
        'ceo',
        'ceo_execution_confirmation_required_before_monitoring_handoff',
      );

      result.push(
        monitoringTask(
          message,
          workflow,
          to,
          'john',
          'monitor_open_position',
          'Monitor the open position against the original thesis and Trade Execution Ticket.',
          [
            'monitoring:position_monitoring:john',
          ],
        ),
        monitoringTask(
          message,
          workflow,
          to,
          'ale',
          'monitor_portfolio_exposure_and_events',
          'Monitor portfolio exposure, correlations, liquidity and the unified event calendar.',
          [
            'monitoring:exposure_event_watch:ale',
          ],
        ),
        monitoringTask(
          message,
          workflow,
          to,
          'carlos',
          'track_realized_vs_expected_performance',
          'Track realized outcomes against the pre-outcome forecast and benchmark.',
          [
            'monitoring:performance_analytics:carlos',
          ],
        ),
        monitoringTask(
          message,
          workflow,
          to,
          'javier',
          'supervise_monitoring_cycle',
          'Supervise the monitoring cycle and consolidate material alerts and reports.',
          [
            'monitoring_ceo_interface:javier',
            'monitoring_final_supervisor:javier',
          ],
        ),
      );
      break;

    case 'CLOSED':
      result.push(
        monitoringTask(
          message,
          workflow,
          to,
          'carlos',
          'finalize_performance_evaluation',
          'Finalize the investment performance evaluation using predefined criteria and coherent benchmarks.',
          [
            'performance_quality_separate_from_outcome',
          ],
        ),
        monitoringTask(
          message,
          workflow,
          to,
          'hakan',
          'finalize_employee_kpi_review_inputs',
          'Prepare role-specific KPI and audit inputs without altering historical operational outputs.',
          [
            'kpi_evaluator_independence',
          ],
        ),
      );
      break;

    case 'POST_MORTEM':
      result.push(
        monitoringTask(
          message,
          workflow,
          to,
          'zielu',
          'conduct_post_mortem',
          'Conduct the governed post-mortem and identify evidence-backed learning candidates.',
          [
            'learning_process_improvement:zielu',
            'do_not_generalize_from_single_failure',
          ],
        ),
        monitoringTask(
          message,
          workflow,
          to,
          'javier',
          'supervise_post_mortem_completion',
          'Supervise post-mortem completeness before archival.',
          [
            'monitoring_final_supervisor:javier',
          ],
        ),
      );
      break;

    case 'ARCHIVED':
      result.push(
        memoryCandidate(
          message,
          workflow,
          to,
          'compose_archived_workflow_experience',
          'Compose the completed workflow into contextualized institutional-memory proposals without automatically creating validated lessons.',
          [
            'memory:experience_creation',
            'memory:no_unreviewed_lesson_becomes_production_rule',
            'memory:preserve_context',
          ],
        ),
      );
      break;
  }

  return result;
}

function planArtifactHandoffs(
  message: ControlPlaneOutboxMessage,
  workflow: InvestmentWorkflow,
): GovernedHandoffInput[] {
  const payload =
    ArtifactPayloadSchema.parse(
      message.payload,
    );

  switch (payload.artifactKind) {
    case 'red_desk_review':
      return [
        agentTask(
          message,
          workflow,
          workflow.state,
          'beppe',
          'review_red_desk_output',
          'Review the Red Desk output and prepare the final research brief when the workflow is ready.',
          [
            'research_ceo_interface:beppe',
            'mandatory_review:yann_then_beppe',
          ],
          {
            artifactId:
              payload.artifactId,
          },
        ),
      ];

    case 'independent_risk_verdict':
      return [
        agentTask(
          message,
          workflow,
          workflow.state,
          'christian',
          'review_independent_risk_verdict',
          'Review Pio’s independent verdict and prepare the definitive risk output when permitted.',
          [
            'risk_final_supervisor:christian',
            'independent_risk_review:pio',
          ],
          {
            artifactId:
              payload.artifactId,
          },
        ),
      ];

    case 'post_mortem':
      return [
        memoryCandidate(
          message,
          workflow,
          workflow.state,
          'compose_post_mortem_memory_proposal',
          'Compose the post-mortem into one or more governed Startup Brain mutation proposals.',
          [
            'memory:post_mortem',
            'memory:proposal_before_commit',
          ],
        ),
      ];

    default:
      return [];
  }
}

function planInvalidationHandoffs(
  message: ControlPlaneOutboxMessage,
  workflow: InvestmentWorkflow,
  resolved: boolean,
): GovernedHandoffInput[] {
  const payload = resolved
    ? InvalidationResolvedPayloadSchema.parse(
        message.payload,
      )
    : InvalidationRecordedPayloadSchema.parse(
        message.payload,
      );

  const inRiskOrExecution = [
    'RISK_ANALYSIS',
    'RISK_REVIEW',
    'RISK_MODIFICATION_REQUIRED',
    'RISK_APPROVED',
    'WAITING_CEO_EXECUTION',
  ].includes(workflow.state);

  const destinationAgent =
    inRiskOrExecution
      ? 'christian'
      : 'javier';

  const action = resolved
    ? 'review_resolved_material_invalidation'
    : 'review_material_invalidation';

  const result: GovernedHandoffInput[] = [
    makeHandoff({
      message,
      workflow,
      stateAtEvent:
        workflow.state,
      kind:
        inRiskOrExecution
          ? 'agent_task'
          : 'monitoring_task',
      destination: {
        kind: 'agent',
        id: destinationAgent,
      },
      action,
      summary: resolved
        ? 'Review the resolved material invalidation and determine the governed next step.'
        : 'Review the material invalidation and coordinate the governed response.',
      policyEvidence: [
        inRiskOrExecution
          ? 'risk_ceo_interface:christian'
          : 'monitoring_ceo_interface:javier',
        'material_change_requires_governed_reassessment',
      ],
    }),
  ];

  if (!resolved) {
    result.push(
      memoryCandidate(
        message,
        workflow,
        workflow.state,
        'capture_material_invalidation',
        'Consider the material invalidation and resulting response as an institutional-memory candidate.',
        [
          'memory:contextualized_material_events_used_in_decisions',
        ],
      ),
    );
  }

  return result;
}

function planFinancialHandoffs(
  message: ControlPlaneOutboxMessage,
): GovernedHandoffInput[] {
  const payload =
    FinancialPayloadSchema.parse(
      message.payload,
    );

  if (payload.allowed) {
    /*
     * Deliberately no broker/exchange handoff.
     * Authorization is not execution. The human CEO executes manually.
     */
    return [];
  }

  return [
    makeHandoff({
      message,
      kind: 'security_alert',
      destination: {
        kind: 'human',
        id: 'ceo',
      },
      action:
        'review_denied_financial_action',
      summary:
        'Review a financial action denied by the Control Plane.',
      policyEvidence: [
        'financial_execution_only_ceo',
        'agents_allowed_execution:false',
      ],
      payload: {
        financialAction:
          payload.financialAction,
        allowed: false,
      },
    }),
  ];
}

export function planGovernedHandoffs(input: {
  message: ControlPlaneOutboxMessage;
  workflow?: InvestmentWorkflow;
}): GovernedHandoffInput[] {
  const {
    message,
    workflow,
  } = input;

  switch (message.topic) {
    case 'control-plane.workflow.created':
      return [];

    case 'control-plane.workflow.transitioned':
      if (!workflow) {
        throw new Error(
          `handoff_workflow_required:${message.messageId}`,
        );
      }

      return planTransitionHandoffs(
        message,
        workflow,
      );

    case 'control-plane.artifact.registered':
      if (!workflow) {
        throw new Error(
          `handoff_workflow_required:${message.messageId}`,
        );
      }

      return planArtifactHandoffs(
        message,
        workflow,
      );

    case 'control-plane.invalidation.recorded':
      if (!workflow) {
        throw new Error(
          `handoff_workflow_required:${message.messageId}`,
        );
      }

      return planInvalidationHandoffs(
        message,
        workflow,
        false,
      );

    case 'control-plane.invalidation.resolved':
      if (!workflow) {
        throw new Error(
          `handoff_workflow_required:${message.messageId}`,
        );
      }

      return planInvalidationHandoffs(
        message,
        workflow,
        true,
      );

    case 'control-plane.financial-action.authorized':
    case 'control-plane.financial-action.denied':
      return planFinancialHandoffs(
        message,
      );

    default:
      throw new Error(
        `unroutable_control_plane_topic:${message.topic}`,
      );
  }
}
