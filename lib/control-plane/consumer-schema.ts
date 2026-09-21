import { z } from 'zod';

import {
  BrainActorSchema,
  TimestampSchema,
} from '@/lib/brain/core-schema';

export const ConsumerDeliveryStatusSchema = z.enum([
  'processing',
  'succeeded',
]);

export const ConsumerDeliveryReceiptSchema = z.object({
  consumerId: z.string().min(1),
  messageId: z.string().min(1),
  topic: z.string().min(1),

  status: ConsumerDeliveryStatusSchema,
  attempts: z.number().int().min(0),

  firstReceivedAt: TimestampSchema,
  lastAttemptAt: TimestampSchema,

  completedAt: TimestampSchema.optional(),

  leaseOwner: z.string().min(1).optional(),
  leaseUntil: TimestampSchema.optional(),

  lastError: z.string().optional(),

  result: z.record(z.unknown()).default({}),
});

export const ConsumerDeliveryClaimOutcomeSchema = z.enum([
  'claimed',
  'already_succeeded',
  'busy',
]);

export const ConsumerDeliveryClaimResultSchema = z.object({
  outcome: ConsumerDeliveryClaimOutcomeSchema,
  receipt: ConsumerDeliveryReceiptSchema,
});

export const DeadLetterRedriveRecordSchema = z.object({
  redriveId: z.string().min(1),
  messageId: z.string().min(1),
  requestedBy: BrainActorSchema,
  requestedAt: TimestampSchema,
  reason: z.string().min(1),
});

export type ConsumerDeliveryReceipt = z.infer<
  typeof ConsumerDeliveryReceiptSchema
>;

export type ConsumerDeliveryClaimResult = z.infer<
  typeof ConsumerDeliveryClaimResultSchema
>;

export type DeadLetterRedriveRecord = z.infer<
  typeof DeadLetterRedriveRecordSchema
>;
