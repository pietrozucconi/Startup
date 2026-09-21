import { z } from 'zod';

import {
  ContextEnvelopeSchema,
  NonNegativeFiniteSchema,
  PositiveFiniteSchema,
  TimestampSchema,
  UnitIntervalSchema,
} from '@/lib/brain/core-schema';

export const MemorySystemSchema = z.enum([
  'structural',
  'working',
  'episodic',
  'semantic',
  'procedural',
  'prospective',
  'metacognitive',
]);

export const MemoryStageSchema = z.enum([
  'structural',
  'working',
  'raw_experience',
  'interpreted_experience',
  'lesson_candidate',
  'validated_lesson',
  'consolidated',
  'superseded',
  'archived',
]);

export const SalienceDimensionsSchema = z
  .object({
    novelty: UnitIntervalSchema.default(0),
    surprise: UnitIntervalSchema.default(0),
    materiality: UnitIntervalSchema.default(0),
    urgency: UnitIntervalSchema.default(0),
    riskImpact: UnitIntervalSchema.default(0),
    expectedUtility: UnitIntervalSchema.default(0),
  })
  .default({});

export const MemoryTraceSchema = z.object({
  system: MemorySystemSchema,
  stage: MemoryStageSchema,

  salience: SalienceDimensionsSchema,

  activation: UnitIntervalSchema.default(0),
  retentionStrength: UnitIntervalSchema.default(1),
  consolidationScore: UnitIntervalSchema.default(0),

  accessCount: z.number().int().min(0).default(0),
  rehearsalCount: z.number().int().min(0).default(0),

  lastAccessedAt: TimestampSchema.optional(),
  lastReinforcedAt: TimestampSchema.optional(),

  decayHalfLifeHours: PositiveFiniteSchema.optional(),

  retentionLock: z.boolean().default(false),
  pendingReview: z.boolean().default(false),
});

export const ConsolidationPolicySchema = z.object({
  minimumObservations: z.number().int().positive(),
  minimumIndependentSources: z.number().int().nonnegative(),
  minimumOutcomeEvaluations: z.number().int().nonnegative(),
  minimumConfidence: UnitIntervalSchema,
  requireHumanApprovalForValidatedLessons: z.boolean(),
});

export const CognitivePolicySchema = z.object({
  workingMemoryCapacity: z.number().int().positive(),
  defaultRetrievalLimit: z.number().int().positive(),
  maxGraphHops: z.number().int().min(0),
  activationDecayPerHop: UnitIntervalSchema,
  minimumEdgeStrengthForSpread: UnitIntervalSchema,
  archiveBelowRetentionStrength: UnitIntervalSchema,
  consolidation: ConsolidationPolicySchema,
});

export const WorkingMemoryFrameSchema = z
  .object({
    id: z.string().min(1),
    purpose: z.string().min(1),
    focusNodeIds: z.array(z.string().min(1)).default([]),
    cueNodeIds: z.array(z.string().min(1)).default([]),
    goalNodeIds: z.array(z.string().min(1)).default([]),
    suppressedNodeIds: z.array(z.string().min(1)).default([]),
    capacity: z.number().int().positive(),
    attentionBudget: NonNegativeFiniteSchema.default(1),
    context: ContextEnvelopeSchema,
    createdAt: TimestampSchema,
    expiresAt: TimestampSchema.optional(),
  })
  .superRefine((frame, ctx) => {
    const uniqueWorkingSet = new Set([
      ...frame.focusNodeIds,
      ...frame.cueNodeIds,
      ...frame.goalNodeIds,
    ]);

    if (uniqueWorkingSet.size > frame.capacity) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['capacity'],
        message: 'Working-memory frame exceeds its declared capacity',
      });
    }

    if (
      frame.expiresAt &&
      Date.parse(frame.expiresAt) < Date.parse(frame.createdAt)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expiresAt'],
        message: 'expiresAt cannot be earlier than createdAt',
      });
    }
  });

export type MemorySystem = z.infer<typeof MemorySystemSchema>;
export type MemoryStage = z.infer<typeof MemoryStageSchema>;
export type MemoryTrace = z.infer<typeof MemoryTraceSchema>;
export type CognitivePolicy = z.infer<typeof CognitivePolicySchema>;
export type WorkingMemoryFrame = z.infer<typeof WorkingMemoryFrameSchema>;
