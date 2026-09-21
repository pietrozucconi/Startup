import { z } from 'zod';

import {
  TimestampSchema,
} from '@/lib/brain/core-schema';

import {
  ControlPlaneAuditRecordSchema,
  InvestmentWorkflowSchema,
  type InvestmentWorkflow,
} from '@/lib/control-plane/schema';

import {
  ControlPlaneCommandRecordSchema,
  ControlPlaneDomainEventSchema,
  ControlPlaneOutboxMessageSchema,
  type ControlPlaneCommandRecord,
} from '@/lib/control-plane/durable-schema';

import type {
  ControlPlaneStore,
} from '@/lib/control-plane/store';

export const AtomicWorkflowMutationSchema =
  z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('none'),
    }),
    z.object({
      kind: z.literal('create'),
      workflow: InvestmentWorkflowSchema,
    }),
    z.object({
      kind: z.literal('replace'),
      workflow: InvestmentWorkflowSchema,
      expectedRevision: z.number().int().min(0),
    }),
  ]);

export const AtomicControlPlaneCommitSchema = z.object({
  command: ControlPlaneCommandRecordSchema,
  mutation: AtomicWorkflowMutationSchema,
  processedAt: TimestampSchema,
  audit: ControlPlaneAuditRecordSchema,
  events: z
    .array(ControlPlaneDomainEventSchema)
    .min(1),
  outbox: z
    .array(ControlPlaneOutboxMessageSchema)
    .min(1),
});

export type AtomicWorkflowMutation = z.infer<
  typeof AtomicWorkflowMutationSchema
>;

export type AtomicControlPlaneCommitInput = z.input<
  typeof AtomicControlPlaneCommitSchema
>;

export type AtomicControlPlaneCommit = z.infer<
  typeof AtomicControlPlaneCommitSchema
>;

export type AtomicControlPlaneCommitResult = {
  duplicate: boolean;
  workflow?: InvestmentWorkflow;
  command?: ControlPlaneCommandRecord;
};

export interface AtomicControlPlaneStore
  extends ControlPlaneStore
{
  getCommandByRequestId(
    requestId: string,
  ): Promise<ControlPlaneCommandRecord | null>;

  commitAtomic(
    input: AtomicControlPlaneCommitInput,
  ): Promise<AtomicControlPlaneCommitResult>;
}
