import type {
  InvestmentWorkflowState,
  WorkflowArtifactKind,
} from '@/lib/control-plane/schema';

export const CANONICAL_GOVERNANCE_VERSION = '1.0' as const;

export const CEO_ID = 'ceo' as const;

export const RESEARCH_AGENT_IDS = [
  'djed',
  'marcus',
  'lauti',
  'pepo',
  'andy',
  'yann',
  'beppe',
] as const;

export const RISK_AGENT_IDS = [
  'manuel',
  'dimash',
  'bare',
  'angelo',
  'pio',
  'christian',
] as const;

export const MONITORING_AGENT_IDS = [
  'john',
  'ale',
  'carlos',
  'hakan',
  'zielu',
  'javier',
] as const;

export const RESEARCH_PREPARER_IDS = [
  'lauti',
  'pepo',
  'andy',
] as const;

export const FINAL_SUPERVISORS = {
  research: 'beppe',
  risk: 'christian',
  monitoring: 'javier',
} as const;

export const INDEPENDENT_REVIEWERS = {
  research: 'yann',
  risk: 'pio',
} as const;

export const INVESTMENT_WORKFLOW_TRANSITIONS: Record<
  InvestmentWorkflowState,
  readonly InvestmentWorkflowState[]
> = {
  DRAFT: ['RESEARCHING'],
  RESEARCHING: ['READY_FOR_RED_DESK'],
  READY_FOR_RED_DESK: ['UNDER_CRITICAL_REVIEW'],
  UNDER_CRITICAL_REVIEW: [
    'READY_FOR_FINAL_RESEARCH_SUPERVISOR',
  ],
  READY_FOR_FINAL_RESEARCH_SUPERVISOR: [
    'WAITING_CEO_RESEARCH_DECISION',
  ],
  WAITING_CEO_RESEARCH_DECISION: [
    'CEO_RESEARCH_REJECTED',
    'CEO_RESEARCH_APPROVED',
  ],
  CEO_RESEARCH_REJECTED: ['ARCHIVED'],
  CEO_RESEARCH_APPROVED: ['RISK_ANALYSIS'],
  RISK_ANALYSIS: ['RISK_REVIEW'],
  RISK_REVIEW: [
    'RISK_REJECTED',
    'RISK_MODIFICATION_REQUIRED',
    'RISK_APPROVED',
  ],
  RISK_REJECTED: ['ARCHIVED'],
  RISK_MODIFICATION_REQUIRED: ['RISK_ANALYSIS'],
  RISK_APPROVED: ['WAITING_CEO_EXECUTION'],
  WAITING_CEO_EXECUTION: [
    'CEO_EXECUTION_CONFIRMED',
  ],
  CEO_EXECUTION_CONFIRMED: ['MONITORING'],
  MONITORING: ['CLOSED'],
  CLOSED: ['POST_MORTEM'],
  POST_MORTEM: ['ARCHIVED'],
  ARCHIVED: [],
};

export const CEO_GATED_SOURCE_STATES = new Set<
  InvestmentWorkflowState
>([
  'WAITING_CEO_RESEARCH_DECISION',
  'WAITING_CEO_EXECUTION',
]);

export const RESEARCH_STATES = new Set<
  InvestmentWorkflowState
>([
  'DRAFT',
  'RESEARCHING',
  'READY_FOR_RED_DESK',
  'UNDER_CRITICAL_REVIEW',
  'READY_FOR_FINAL_RESEARCH_SUPERVISOR',
  'WAITING_CEO_RESEARCH_DECISION',
  'CEO_RESEARCH_REJECTED',
  'CEO_RESEARCH_APPROVED',
]);

export const RISK_STATES = new Set<
  InvestmentWorkflowState
>([
  'RISK_ANALYSIS',
  'RISK_REVIEW',
  'RISK_REJECTED',
  'RISK_MODIFICATION_REQUIRED',
  'RISK_APPROVED',
  'WAITING_CEO_EXECUTION',
]);

export const MONITORING_STATES = new Set<
  InvestmentWorkflowState
>([
  'CEO_EXECUTION_CONFIRMED',
  'MONITORING',
  'CLOSED',
  'POST_MORTEM',
  'ARCHIVED',
]);

export const IMMUTABLE_HISTORICAL_ARTIFACTS =
  new Set<WorkflowArtifactKind>([
    'research_proposal',
    'red_desk_review',
    'ceo_research_decision',
    'portfolio_risk_assessment',
    'trade_structure',
    'liquidity_event_assessment',
    'broker_execution_instructions',
    'independent_risk_verdict',
    'final_risk_ticket',
    'ceo_execution_confirmation',
    'employee_kpi_report',
  ]);

export const ARTIFACT_AUTHORS: Record<
  WorkflowArtifactKind,
  readonly string[]
> = {
  research_proposal: [
    'lauti',
    'pepo',
    'andy',
  ],
  red_desk_review: ['yann'],
  final_research_brief: ['beppe'],
  ceo_research_decision: ['ceo'],

  portfolio_risk_assessment: ['manuel'],
  trade_structure: ['dimash'],
  liquidity_event_assessment: ['bare'],
  broker_execution_instructions: ['angelo'],
  independent_risk_verdict: ['pio'],
  final_risk_ticket: ['christian'],

  ceo_execution_confirmation: ['ceo'],

  position_monitoring_record: ['john'],
  portfolio_exposure_record: ['ale'],
  performance_evaluation: ['carlos'],
  employee_kpi_report: ['hakan'],
  process_learning_recommendation: ['zielu'],
  final_monitoring_report: ['javier'],

  closure_record: ['javier'],
  post_mortem: ['zielu', 'javier'],

  correction: [
    'ceo',
    'beppe',
    'christian',
    'javier',
  ],
};

export const FINANCIAL_EXECUTION_ACTIONS = [
  'buy',
  'sell',
  'deposit',
  'withdraw',
  'modify_order',
  'cancel_order',
] as const;

export const MATERIAL_INVALIDATION_RECORDER_IDS = [
  'manuel',
  'bare',
  'pio',
  'christian',
  'john',
  'ale',
  'javier',
] as const;

/**
 * Numerical portfolio and trade risk limits are intentionally absent.
 * Canonical governance declares numeric_limits_defined: false.
 */
export const NUMERIC_RISK_LIMITS_DEFINED = false as const;
