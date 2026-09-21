import { z } from 'zod';

import {
  TimestampSchema,
} from '@/lib/brain/core-schema';

import {
  InvestmentWorkflowStateSchema,
} from '@/lib/control-plane/schema';

import {
  RetryPolicySchema,
} from '@/lib/control-plane/jobs';

export const GovernedHandoffKindSchema = z.enum([
  'agent_task',
  'ceo_approval_request',
  'ceo_notification',
  'monitoring_task',
  'memory_candidate',
  'security_alert',
]);

export const HandoffDestinationKindSchema = z.enum([
  'agent',
  'human',
  'department',
  'startup_brain',
]);

export const HandoffDestinationSchema = z.object({
  kind: HandoffDestinationKindSchema,
  id: z.string().min(1),
});

export const GovernedHandoffStatusSchema = z.enum([
  'pending',
  'in_flight',
  'delivered',
  'dead_letter',
  'cancelled',
]);

export const GovernedHandoffSchema = z.object({
  handoffId: z.string().min(1),

  sourceMessageId: z.string().min(1),
  sourceTopic: z.string().min(1),

  workflowId: z.string().min(1).optional(),
  stateAtEvent: InvestmentWorkflowStateSchema.optional(),

  kind: GovernedHandoffKindSchema,
  destination: HandoffDestinationSchema,

  action: z.string().min(1),
  summary: z.string().min(1),

  status: GovernedHandoffStatusSchema.default('pending'),
  attempts: z.number().int().min(0).default(0),

  createdAt: TimestampSchema,
  availableAt: TimestampSchema,

  retryPolicy: RetryPolicySchema,

  leaseOwner: z.string().min(1).optional(),
  leaseUntil: TimestampSchema.optional(),

  deliveredAt: TimestampSchema.optional(),
  lastError: z.string().optional(),

  policyEvidence: z.array(z.string().min(1)).default([]),
  payload: z.record(z.unknown()).default({}),
});

export type GovernedHandoff = z.infer<
  typeof GovernedHandoffSchema
>;

export type GovernedHandoffInput = z.input<
  typeof GovernedHandoffSchema
>;

export type HandoffDestination = z.infer<
  typeof HandoffDestinationSchema
>;

export type GovernedHandoffKind = z.infer<
  typeof GovernedHandoffKindSchema
>;
