import { z } from 'zod';
import { TimestampSchema } from '@/lib/brain/core-schema';
import { InvestmentWorkflowStateSchema } from '@/lib/control-plane/schema';
import { RetryPolicySchema } from '@/lib/control-plane/jobs';

export const AgentRuntimeTaskStatusSchema = z.enum(['queued','running','completed','dead_letter','cancelled']);
export const AgentRuntimeTaskPrioritySchema = z.enum(['normal','high','critical']);
export const AgentRuntimeTaskSchema = z.object({
  taskId: z.string().min(1), handoffId: z.string().min(1), workflowId: z.string().min(1).optional(),
  agentId: z.string().min(1), action: z.string().min(1), summary: z.string().min(1),
  stateAtAssignment: InvestmentWorkflowStateSchema.optional(),
  priority: AgentRuntimeTaskPrioritySchema.default('normal'),
  status: AgentRuntimeTaskStatusSchema.default('queued'), attempts: z.number().int().min(0).default(0),
  createdAt: TimestampSchema, availableAt: TimestampSchema, updatedAt: TimestampSchema,
  retryPolicy: RetryPolicySchema, leaseOwner: z.string().min(1).optional(), leaseUntil: TimestampSchema.optional(),
  completedAt: TimestampSchema.optional(), lastError: z.string().optional(),
  policyEvidence: z.array(z.string().min(1)).default([]), payload: z.record(z.unknown()).default({}), result: z.record(z.unknown()).default({}),
});
export const CeoInboxCategorySchema = z.enum(['approval_request','notification','security_alert']);
export const CeoInboxStatusSchema = z.enum(['pending','acknowledged','resolved']);
export const CeoInboxItemSchema = z.object({
  inboxId: z.string().min(1), handoffId: z.string().min(1), workflowId: z.string().min(1).optional(),
  category: CeoInboxCategorySchema, action: z.string().min(1), summary: z.string().min(1),
  stateAtCreation: InvestmentWorkflowStateSchema.optional(), status: CeoInboxStatusSchema.default('pending'),
  createdAt: TimestampSchema, updatedAt: TimestampSchema, acknowledgedAt: TimestampSchema.optional(), resolvedAt: TimestampSchema.optional(),
  resolvedByControlPlaneRequestId: z.string().min(1).optional(), policyEvidence: z.array(z.string().min(1)).default([]), payload: z.record(z.unknown()).default({}),
});
export const RuntimeRedriveKindSchema = z.enum(['agent_task','handoff']);
export const RuntimeRedriveRecordSchema = z.object({
  redriveId: z.string().min(1), kind: RuntimeRedriveKindSchema, targetId: z.string().min(1), requestedAt: TimestampSchema,
  reason: z.string().min(1), previousAttempts: z.number().int().min(0),
});
export type AgentRuntimeTask = z.infer<typeof AgentRuntimeTaskSchema>;
export type AgentRuntimeTaskInput = z.input<typeof AgentRuntimeTaskSchema>;
export type CeoInboxItem = z.infer<typeof CeoInboxItemSchema>;
export type CeoInboxItemInput = z.input<typeof CeoInboxItemSchema>;
export type RuntimeRedriveRecord = z.infer<typeof RuntimeRedriveRecordSchema>;
