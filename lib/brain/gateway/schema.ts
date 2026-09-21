import { z } from 'zod';

import {
  BrainActorSchema,
  ContextEnvelopeSchema,
  TimestampSchema,
} from '@/lib/brain/core-schema';

import {
  BrainGraphEventSchema,
} from '@/lib/brain/events';

import {
  BrainGraphNodeTypeSchema,
} from '@/lib/brain/graph-schema';

import {
  BrainRetrievalQuerySchema,
} from '@/lib/brain/retrieval';

/**
 * Capabilities are granted by trusted company infrastructure.
 * Agents must never self-assert these values.
 */
export const BrainCapabilitySchema = z.enum([
  'brain.read',
  'brain.retrieve',
  'brain.inspect',
  'brain.health',
  'brain.propose_write',
  'brain.commit_write',
  'brain.read_confidential',
  'brain.read_restricted',
  'brain.admin',
]);

export const BrainGatewayPrincipalSchema = z.object({
  actor: BrainActorSchema,
  departmentIds: z.array(z.string().min(1)).default([]),
  capabilities: z.array(BrainCapabilitySchema).default([]),
  sessionId: z.string().min(1).optional(),
  issuedBy: z.string().min(1).default('control-plane'),
});

export const BrainInformationIntentSchema = z.enum([
  'institutional_memory',
  'prior_reasoning',
  'prior_decisions',
  'past_experiences',
  'validated_lessons',
  'policies_and_sops',
  'graph_exploration',
  'brain_health',

  'current_market_price',
  'historical_market_data',
  'latest_company_filing',
  'latest_news',
  'web_research',
  'live_portfolio_state',
  'execution_request',

  'mixed_brain_and_current_context',
]);

export const BrainRouteSchema = z.enum([
  'brain',
  'market_data',
  'filings',
  'web',
  'portfolio',
  'control_plane',
]);

export const BrainRouteDecisionSchema = z.object({
  intent: BrainInformationIntentSchema,
  routes: z.array(BrainRouteSchema).min(1),
  brainRequired: z.boolean(),
  explanation: z.string().min(1),
});

export const BrainReadBudgetSchema = z.object({
  maxResults: z.number().int().positive().max(200).default(20),
  maxHops: z.number().int().min(0).max(12).default(3),
  maxContentCharsPerNode: z.number().int().min(0).max(100_000).default(4_000),
  maxTotalContentChars: z.number().int().min(0).max(1_000_000).default(40_000),
  includeContent: z.boolean().default(true),
  includeMetadata: z.boolean().default(true),
});

export const BrainReadRequestSchema = z.object({
  requestId: z.string().min(1),
  principal: BrainGatewayPrincipalSchema,
  intent: BrainInformationIntentSchema,
  purpose: z.string().min(1),
  query: BrainRetrievalQuerySchema,
  context: ContextEnvelopeSchema,
  budget: BrainReadBudgetSchema,
  requestedNodeTypes: z.array(BrainGraphNodeTypeSchema).default([]),
});

export const BrainNodeInspectRequestSchema = z.object({
  requestId: z.string().min(1),
  principal: BrainGatewayPrincipalSchema,
  intent: BrainInformationIntentSchema.default('graph_exploration'),
  purpose: z.string().min(1),
  nodeId: z.string().min(1),
  includeNeighbors: z.boolean().default(true),
  neighborLimit: z.number().int().positive().max(200).default(50),
  budget: BrainReadBudgetSchema,
});

export const BrainGraphExploreRequestSchema = z.object({
  requestId: z.string().min(1),
  principal: BrainGatewayPrincipalSchema,
  purpose: z.string().min(1),
  seedNodeIds: z.array(z.string().min(1)).min(1),
  maxHops: z.number().int().min(0).max(12).default(2),
  maxNodes: z.number().int().positive().max(1_000).default(200),
});

export const BrainMutationProposalSchema = z.object({
  proposalId: z.string().min(1),
  requestId: z.string().min(1),
  principal: BrainGatewayPrincipalSchema,
  purpose: z.string().min(1),
  reason: z.string().min(1),
  events: z.array(BrainGraphEventSchema).min(1).max(100),
  proposedAt: TimestampSchema,
  context: ContextEnvelopeSchema,
});

export const BrainMutationApprovalSchema = z.object({
  approvedBy: BrainActorSchema,
  approvedAt: TimestampSchema,
  reason: z.string().min(1),
});

export type BrainMutationApproval = z.infer<
  typeof BrainMutationApprovalSchema
>;

export const BrainMutationCommitRequestSchema = z.object({
  requestId: z.string().min(1),
  principal: BrainGatewayPrincipalSchema,
  proposal: BrainMutationProposalSchema,
  approval: BrainMutationApprovalSchema.optional(),
  expectedRevision: z.number().int().min(0).optional(),
});

export const BrainAuditOutcomeSchema = z.enum([
  'allowed',
  'denied',
  'routed_external',
  'proposed',
  'committed',
  'failed',
]);

export const BrainAuditRecordSchema = z.object({
  auditId: z.string().min(1),
  requestId: z.string().min(1),
  at: TimestampSchema,
  actor: BrainActorSchema,
  action: z.string().min(1),
  outcome: BrainAuditOutcomeSchema,
  reason: z.string().default(''),
  graphRevisionBefore: z.number().int().min(0).optional(),
  graphRevisionAfter: z.number().int().min(0).optional(),
  metadata: z.record(z.unknown()).default({}),
});

export type BrainCapability = z.infer<typeof BrainCapabilitySchema>;
export type BrainGatewayPrincipal = z.infer<typeof BrainGatewayPrincipalSchema>;
export type BrainInformationIntent = z.infer<typeof BrainInformationIntentSchema>;
export type BrainRoute = z.infer<typeof BrainRouteSchema>;
export type BrainRouteDecision = z.infer<typeof BrainRouteDecisionSchema>;
export type BrainReadBudget = z.infer<typeof BrainReadBudgetSchema>;
export type BrainReadRequestInput = z.input<typeof BrainReadRequestSchema>;
export type BrainReadRequest = z.infer<typeof BrainReadRequestSchema>;
export type BrainNodeInspectRequestInput = z.input<typeof BrainNodeInspectRequestSchema>;
export type BrainGraphExploreRequestInput = z.input<typeof BrainGraphExploreRequestSchema>;
export type BrainMutationProposalInput = z.input<typeof BrainMutationProposalSchema>;
export type BrainMutationProposal = z.infer<typeof BrainMutationProposalSchema>;
export type BrainMutationCommitRequestInput = z.input<typeof BrainMutationCommitRequestSchema>;
export type BrainAuditRecord = z.infer<typeof BrainAuditRecordSchema>;
