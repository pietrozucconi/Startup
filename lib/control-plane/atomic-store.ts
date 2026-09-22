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
      expectedRevision:
        z.number().int().min(0),
    }),
  ]);

export const AtomicControlPlaneCommitSchema =
  z.object({
    command:
      ControlPlaneCommandRecordSchema,
    mutation:
      AtomicWorkflowMutationSchema,
    processedAt:
      TimestampSchema,
    audit:
      ControlPlaneAuditRecordSchema,
    events: z
      .array(
        ControlPlaneDomainEventSchema,
      )
      .min(1),
    outbox: z
      .array(
        ControlPlaneOutboxMessageSchema,
      )
      .min(1),
  });

export const RequestIntegrityStatusSchema =
  z.enum([
    'reserved',
    'committed',
  ]);

export const RequestIntegrityRecordSchema =
  z.object({
    requestId:
      z.string().min(1),

    fingerprint:
      z.string()
        .regex(
          /^sha256:[a-f0-9]{64}$/,
        ),

    status:
      RequestIntegrityStatusSchema,

    firstSeenAt:
      TimestampSchema,

    lastSeenAt:
      TimestampSchema,

    committedAt:
      TimestampSchema.optional(),
  });

export type AtomicWorkflowMutation =
  z.infer<
    typeof AtomicWorkflowMutationSchema
  >;

export type AtomicControlPlaneCommitInput =
  z.input<
    typeof AtomicControlPlaneCommitSchema
  >;

export type AtomicControlPlaneCommit =
  z.infer<
    typeof AtomicControlPlaneCommitSchema
  >;

export type RequestIntegrityRecord =
  z.infer<
    typeof RequestIntegrityRecordSchema
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
  ): Promise<
    ControlPlaneCommandRecord | null
  >;

  /**
   * Reserve the semantic meaning of a requestId before any permission,
   * gate or mutation work is performed.
   *
   * Same requestId + same fingerprint is safe.
   * Same requestId + different fingerprint is an integrity violation.
   */
  reserveRequestFingerprint(input: {
    requestId: string;
    fingerprint: string;
    observedAt: string;
  }): Promise<RequestIntegrityRecord>;

  getRequestFingerprint(
    requestId: string,
  ): Promise<
    RequestIntegrityRecord | null
  >;

  commitAtomic(
    input:
      AtomicControlPlaneCommitInput,
  ): Promise<
    AtomicControlPlaneCommitResult
  >;
}
