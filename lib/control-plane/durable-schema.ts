import { z } from 'zod';

import {
  BrainActorSchema,
  TimestampSchema,
} from '@/lib/brain/core-schema';

import {
  RetryPolicySchema,
} from '@/lib/control-plane/jobs';

export const ControlPlaneCommandTypeSchema = z.enum([
  'create_workflow',
  'register_artifact',
  'transition_workflow',
  'record_invalidation',
  'resolve_invalidation',
  'authorize_financial_action',
  'schedule_job',
  'cancel_job',
]);

export const ControlPlaneCommandOutcomeSchema = z.enum([
  'accepted',
  'succeeded',
  'denied',
  'duplicate',
  'failed',
]);

export const ControlPlaneCommandRecordSchema = z.object({
  commandId: z.string().min(1),
  requestId: z.string().min(1),
  workflowId: z.string().min(1).optional(),
  commandType: ControlPlaneCommandTypeSchema,
  actor: BrainActorSchema,
  receivedAt: TimestampSchema,
  outcome: ControlPlaneCommandOutcomeSchema,
  reason: z.string().default(''),
  payload: z.record(z.unknown()).default({}),
});

export const ControlPlaneDomainEventTypeSchema = z.enum([
  'workflow_created',
  'artifact_registered',
  'workflow_transitioned',
  'invalidation_recorded',
  'invalidation_resolved',
  'financial_action_authorized',
  'financial_action_denied',
  'job_scheduled',
  'job_completed',
  'job_failed',
]);

export const ControlPlaneDomainEventSchema = z.object({
  eventId: z.string().min(1),
  requestId: z.string().min(1),
  workflowId: z.string().min(1).optional(),
  sequence: z.number().int().min(0).optional(),
  eventType: ControlPlaneDomainEventTypeSchema,
  actor: BrainActorSchema,
  occurredAt: TimestampSchema,
  payload: z.record(z.unknown()).default({}),
});

export const OutboxStatusSchema = z.enum([
  'pending',
  'in_flight',
  'published',
  'dead_letter',
]);

export const ControlPlaneOutboxMessageSchema = z.object({
  messageId: z.string().min(1),
  topic: z.string().min(1),
  partitionKey: z.string().min(1),
  workflowId: z.string().min(1).optional(),

  status: OutboxStatusSchema.default('pending'),
  attempts: z.number().int().min(0).default(0),

  createdAt: TimestampSchema,
  availableAt: TimestampSchema,

  retryPolicy: RetryPolicySchema,

  leaseOwner: z.string().min(1).optional(),
  leaseUntil: TimestampSchema.optional(),

  lastError: z.string().optional(),
  publishedAt: TimestampSchema.optional(),

  payload: z.record(z.unknown()).default({}),
});

export const DurableJobStatusSchema = z.enum([
  'scheduled',
  'running',
  'succeeded',
  'cancelled',
  'dead_letter',
]);

export const DurableScheduledJobSchema = z.object({
  jobId: z.string().min(1),
  workflowId: z.string().min(1).optional(),
  kind: z.string().min(1),

  status: DurableJobStatusSchema.default('scheduled'),
  attempts: z.number().int().min(0).default(0),

  runAt: TimestampSchema,
  createdAt: TimestampSchema,

  startedAt: TimestampSchema.optional(),
  completedAt: TimestampSchema.optional(),

  retryPolicy: RetryPolicySchema,

  leaseOwner: z.string().min(1).optional(),
  leaseUntil: TimestampSchema.optional(),

  lastError: z.string().optional(),

  payload: z.record(z.unknown()).default({}),
});

export const ClaimBatchSchema = z.object({
  workerId: z.string().min(1),
  now: TimestampSchema,
  limit: z.number().int().positive().max(500),
  leaseMs: z.number().int().positive().max(60 * 60 * 1000),
});

export type ControlPlaneCommandRecord = z.infer<
  typeof ControlPlaneCommandRecordSchema
>;

export type ControlPlaneDomainEvent = z.infer<
  typeof ControlPlaneDomainEventSchema
>;

export type ControlPlaneOutboxMessage = z.infer<
  typeof ControlPlaneOutboxMessageSchema
>;

export type ControlPlaneOutboxMessageInput = z.input<
  typeof ControlPlaneOutboxMessageSchema
>;

export type DurableScheduledJobInput = z.input<
  typeof DurableScheduledJobSchema
>;

export type DurableScheduledJob = z.infer<
  typeof DurableScheduledJobSchema
>;

export type ClaimBatchInput = z.input<
  typeof ClaimBatchSchema
>;
