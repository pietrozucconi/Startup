import { z } from 'zod';

import { TimestampSchema } from '@/lib/brain/core-schema';
import { BrainMutationProposalSchema } from '@/lib/brain/gateway/schema';

export const RuntimeWorkerStatusSchema = z.enum(['active', 'stopped']);

export const RuntimeWorkerRecordSchema = z.object({
  workerId: z.string().min(1),
  agentId: z.string().min(1),
  sessionId: z.string().min(1),
  status: RuntimeWorkerStatusSchema,
  startedAt: TimestampSchema,
  lastHeartbeatAt: TimestampSchema,
  stoppedAt: TimestampSchema.optional(),
  metadata: z.record(z.unknown()).default({}),
});

export const AgentExecutionRunStatusSchema = z.enum([
  'running',
  'succeeded',
  'failed',
]);

export const AgentExecutionRunSchema = z.object({
  runId: z.string().min(1),
  taskId: z.string().min(1),
  handoffId: z.string().min(1),
  workflowId: z.string().min(1).optional(),

  agentId: z.string().min(1),
  workerId: z.string().min(1),
  sessionId: z.string().min(1),
  executorId: z.string().min(1),

  status: AgentExecutionRunStatusSchema,

  startedAt: TimestampSchema,
  completedAt: TimestampSchema.optional(),
  durationMs: z.number().int().min(0).optional(),

  model: z.string().min(1).optional(),
  finishReason: z.string().min(1).optional(),

  inputTokens: z.number().int().min(0).default(0),
  outputTokens: z.number().int().min(0).default(0),
  cachedInputTokens: z.number().int().min(0).default(0),
  reasoningTokens: z.number().int().min(0).default(0),

  toolCallCount: z.number().int().min(0).default(0),
  toolFailureCount: z.number().int().min(0).default(0),

  estimatedCostUsd: z.number().finite().min(0).optional(),

  error: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
});

export const RuntimeObservabilityKindSchema = z.enum([
  'worker_registered',
  'worker_heartbeat',
  'worker_stopped',
  'execution_started',
  'execution_succeeded',
  'execution_failed',
  'brain_proposal_persisted',
  'brain_proposal_pending_control_plane',
  'brain_proposal_failed',
]);

export const RuntimeObservabilityEventSchema = z.object({
  eventId: z.string().min(1),
  kind: RuntimeObservabilityKindSchema,
  at: TimestampSchema,

  workerId: z.string().min(1).optional(),
  agentId: z.string().min(1).optional(),
  taskId: z.string().min(1).optional(),
  runId: z.string().min(1).optional(),
  workflowId: z.string().min(1).optional(),
  proposalId: z.string().min(1).optional(),

  payload: z.record(z.unknown()).default({}),
});

export const DurableBrainProposalStatusSchema = z.enum([
  'composed',
  'pending_control_plane',
  'committed',
  'rejected',
  'failed',
]);

export const DurableBrainMutationProposalSchema = z.object({
  proposalId: z.string().min(1),
  handoffId: z.string().min(1),
  requestId: z.string().min(1),

  proposalDigest: z
    .string()
    .regex(/^sha256:[a-f0-9]{64}$/),

  status: DurableBrainProposalStatusSchema,
  proposal: BrainMutationProposalSchema,

  createdAt: TimestampSchema,
  updatedAt: TimestampSchema,

  graphRevision: z.number().int().min(0).optional(),
  lastError: z.string().optional(),
});

export type RuntimeWorkerRecord = z.infer<
  typeof RuntimeWorkerRecordSchema
>;

export type AgentExecutionRun = z.infer<
  typeof AgentExecutionRunSchema
>;

export type RuntimeObservabilityEvent = z.infer<
  typeof RuntimeObservabilityEventSchema
>;

export type DurableBrainMutationProposal = z.infer<
  typeof DurableBrainMutationProposalSchema
>;

export type DurableBrainProposalStatus = z.infer<
  typeof DurableBrainProposalStatusSchema
>;
