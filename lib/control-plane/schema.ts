import { z } from 'zod';

import {
  BrainActorSchema,
  TimestampSchema,
} from '@/lib/brain/core-schema';

export const InvestmentWorkflowStateSchema = z.enum([
  'DRAFT',
  'RESEARCHING',
  'READY_FOR_RED_DESK',
  'UNDER_CRITICAL_REVIEW',
  'READY_FOR_FINAL_RESEARCH_SUPERVISOR',
  'WAITING_CEO_RESEARCH_DECISION',
  'CEO_RESEARCH_REJECTED',
  'CEO_RESEARCH_APPROVED',
  'RISK_ANALYSIS',
  'RISK_REVIEW',
  'RISK_REJECTED',
  'RISK_MODIFICATION_REQUIRED',
  'RISK_APPROVED',
  'WAITING_CEO_EXECUTION',
  'CEO_EXECUTION_CONFIRMED',
  'MONITORING',
  'CLOSED',
  'POST_MORTEM',
  'ARCHIVED',
]);

export const WorkflowArtifactKindSchema = z.enum([
  'research_proposal',
  'red_desk_review',
  'final_research_brief',
  'ceo_research_decision',

  'portfolio_risk_assessment',
  'trade_structure',
  'liquidity_event_assessment',
  'broker_execution_instructions',
  'independent_risk_verdict',
  'final_risk_ticket',

  'ceo_execution_confirmation',

  'position_monitoring_record',
  'portfolio_exposure_record',
  'performance_evaluation',
  'employee_kpi_report',
  'process_learning_recommendation',
  'final_monitoring_report',

  'closure_record',
  'post_mortem',
  'correction',
]);

export const WorkflowArtifactStatusSchema = z.enum([
  'active',
  'superseded',
  'archived',
]);

export const WorkflowArtifactSchema = z.object({
  id: z.string().min(1),
  workflowId: z.string().min(1),
  kind: WorkflowArtifactKindSchema,
  createdBy: BrainActorSchema,
  createdAt: TimestampSchema,
  summary: z.string().min(1),
  status: WorkflowArtifactStatusSchema.default('active'),
  metadata: z.record(z.unknown()).default({}),
});

export const InvalidationKindSchema = z.enum([
  'material_price_change',
  'material_volatility_change',
  'material_news_change',
  'material_portfolio_change',
  'material_event_change',
  'data_staleness',
  'other',
]);

export const WorkflowInvalidationStatusSchema = z.enum([
  'active',
  'resolved',
]);

export const WorkflowInvalidationSchema = z.object({
  id: z.string().min(1),
  workflowId: z.string().min(1),
  kind: InvalidationKindSchema,
  status: WorkflowInvalidationStatusSchema.default('active'),
  reason: z.string().min(1),
  recordedBy: BrainActorSchema,
  recordedAt: TimestampSchema,
  resolvedBy: BrainActorSchema.optional(),
  resolvedAt: TimestampSchema.optional(),
  resolutionReason: z.string().min(1).optional(),
  metadata: z.record(z.unknown()).default({}),
});

export const InvestmentWorkflowSchema = z.object({
  id: z.string().min(1),
  state: InvestmentWorkflowStateSchema,
  revision: z.number().int().min(0),
  createdBy: BrainActorSchema,
  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,

  responsibleResearchAgentId: z.string().min(1).optional(),
  assetRef: z.string().min(1).optional(),

  artifacts: z.array(WorkflowArtifactSchema).default([]),
  invalidations: z.array(WorkflowInvalidationSchema).default([]),

  metadata: z.record(z.unknown()).default({}),
});

export const ControlPlanePrincipalSchema = z.object({
  actor: BrainActorSchema,
  sessionId: z.string().min(1).optional(),
});

export const CreateWorkflowRequestSchema = z.object({
  requestId: z.string().min(1),
  workflowId: z.string().min(1),
  principal: ControlPlanePrincipalSchema,
  responsibleResearchAgentId: z.string().min(1).optional(),
  assetRef: z.string().min(1).optional(),
  reason: z.string().min(1),
  metadata: z.record(z.unknown()).default({}),
});

export const RegisterArtifactRequestSchema = z.object({
  requestId: z.string().min(1),
  workflowId: z.string().min(1),
  principal: ControlPlanePrincipalSchema,
  expectedRevision: z.number().int().min(0).optional(),
  artifact: WorkflowArtifactSchema,
  reason: z.string().min(1),
});

export const TransitionRequestSchema = z.object({
  requestId: z.string().min(1),
  workflowId: z.string().min(1),
  principal: ControlPlanePrincipalSchema,
  fromState: InvestmentWorkflowStateSchema,
  toState: InvestmentWorkflowStateSchema,
  expectedRevision: z.number().int().min(0).optional(),
  reason: z.string().min(1),
});

export const RecordInvalidationRequestSchema = z.object({
  requestId: z.string().min(1),
  workflowId: z.string().min(1),
  principal: ControlPlanePrincipalSchema,
  expectedRevision: z.number().int().min(0).optional(),
  invalidation: WorkflowInvalidationSchema,
  reason: z.string().min(1),
});

export const ResolveInvalidationRequestSchema = z.object({
  requestId: z.string().min(1),
  workflowId: z.string().min(1),
  principal: ControlPlanePrincipalSchema,
  expectedRevision: z.number().int().min(0).optional(),
  invalidationId: z.string().min(1),
  reason: z.string().min(1),
});

export const FinancialActionSchema = z.enum([
  'buy',
  'sell',
  'deposit',
  'withdraw',
  'modify_order',
  'cancel_order',
]);

export const FinancialActionRequestSchema = z.object({
  requestId: z.string().min(1),
  workflowId: z.string().min(1).optional(),
  principal: ControlPlanePrincipalSchema,
  action: FinancialActionSchema,
  reason: z.string().min(1),
});

export const ControlPlaneAuditOutcomeSchema = z.enum([
  'allowed',
  'denied',
  'created',
  'recorded',
  'transitioned',
  'authorized',
  'rejected',
  'duplicate',
  'failed',
]);

export const ControlPlaneAuditRecordSchema = z.object({
  auditId: z.string().min(1),
  requestId: z.string().min(1),
  at: TimestampSchema,
  actor: BrainActorSchema,
  action: z.string().min(1),
  outcome: ControlPlaneAuditOutcomeSchema,
  reason: z.string().default(''),
  workflowId: z.string().min(1).optional(),
  workflowRevisionBefore: z.number().int().min(0).optional(),
  workflowRevisionAfter: z.number().int().min(0).optional(),
  metadata: z.record(z.unknown()).default({}),
});

export const AuthorizationDecisionSchema = z.object({
  allowed: z.boolean(),
  reason: z.string().min(1),
  missingRequirements: z.array(z.string().min(1)).default([]),
});

export type InvestmentWorkflowState = z.infer<
  typeof InvestmentWorkflowStateSchema
>;

export type WorkflowArtifactKind = z.infer<
  typeof WorkflowArtifactKindSchema
>;

export type WorkflowArtifact = z.infer<
  typeof WorkflowArtifactSchema
>;

export type WorkflowInvalidation = z.infer<
  typeof WorkflowInvalidationSchema
>;

export type InvestmentWorkflow = z.infer<
  typeof InvestmentWorkflowSchema
>;

export type ControlPlanePrincipal = z.infer<
  typeof ControlPlanePrincipalSchema
>;

export type CreateWorkflowRequestInput = z.input<
  typeof CreateWorkflowRequestSchema
>;

export type RegisterArtifactRequestInput = z.input<
  typeof RegisterArtifactRequestSchema
>;

export type TransitionRequestInput = z.input<
  typeof TransitionRequestSchema
>;

export type RecordInvalidationRequestInput = z.input<
  typeof RecordInvalidationRequestSchema
>;

export type ResolveInvalidationRequestInput = z.input<
  typeof ResolveInvalidationRequestSchema
>;

export type FinancialAction = z.infer<
  typeof FinancialActionSchema
>;

export type FinancialActionRequestInput = z.input<
  typeof FinancialActionRequestSchema
>;

export type ControlPlaneAuditRecord = z.infer<
  typeof ControlPlaneAuditRecordSchema
>;

export type AuthorizationDecision = z.infer<
  typeof AuthorizationDecisionSchema
>;
