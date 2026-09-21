import { z } from 'zod';

export const TimestampSchema = z.string().datetime({ offset: true });
export const UnitIntervalSchema = z.number().finite().min(0).max(1);
export const PositiveFiniteSchema = z.number().finite().positive();
export const NonNegativeFiniteSchema = z.number().finite().min(0);

export const BrainActorKindSchema = z.enum([
  'agent',
  'human',
  'system',
  'control_plane',
]);

export const BrainActorSchema = z.object({
  kind: BrainActorKindSchema,
  id: z.string().min(1),
});

export const EpistemicKindSchema = z.enum([
  'fact',
  'interpretation',
  'assumption',
  'thesis',
  'decision',
  'outcome',
  'lesson',
  'prediction',
  'counterfactual',
  'question',
]);

export const VerificationStateSchema = z.enum([
  'unverified',
  'partially_verified',
  'verified',
  'disputed',
  'retracted',
]);

export const ErrorClassSchema = z.enum([
  'DATA_ERROR',
  'INTERPRETATION_ERROR',
  'PROCESS_ERROR',
  'FORECAST_ERROR',
  'RISK_ERROR',
]);

export const SourceTypeSchema = z.enum([
  'company_filing',
  'regulator',
  'market_data',
  'portfolio_data',
  'news',
  'academic',
  'social',
  'web',
  'human_input',
  'internal_record',
  'model_output',
  'other',
]);

export const TemporalValiditySchema = z
  .object({
    observedAt: TimestampSchema.optional(),
    validFrom: TimestampSchema.optional(),
    validUntil: TimestampSchema.optional(),
  })
  .default({})
  .superRefine((value, ctx) => {
    if (
      value.validFrom &&
      value.validUntil &&
      Date.parse(value.validUntil) < Date.parse(value.validFrom)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['validUntil'],
        message: 'validUntil cannot be earlier than validFrom',
      });
    }
  });

export const ContextEnvelopeSchema = z
  .object({
    departmentIds: z.array(z.string().min(1)).default([]),
    agentIds: z.array(z.string().min(1)).default([]),
    assetIds: z.array(z.string().min(1)).default([]),
    instrumentIds: z.array(z.string().min(1)).default([]),
    portfolioIds: z.array(z.string().min(1)).default([]),
    workflowIds: z.array(z.string().min(1)).default([]),
    decisionIds: z.array(z.string().min(1)).default([]),
    taskIds: z.array(z.string().min(1)).default([]),
    jurisdictions: z.array(z.string().min(1)).default([]),
    horizons: z.array(z.string().min(1)).default([]),
    marketRegimes: z.array(z.string().min(1)).default([]),
    scenarios: z.array(z.string().min(1)).default([]),
    tags: z.array(z.string().min(1)).default([]),
  })
  .default({});

export const ProvenanceRefSchema = z.object({
  sourceNodeId: z.string().min(1).optional(),
  sourceType: SourceTypeSchema,
  uri: z.string().url().optional(),
  title: z.string().min(1).optional(),
  publisher: z.string().min(1).optional(),
  provider: z.string().min(1).optional(),
  capturedAt: TimestampSchema.optional(),
  observedAt: TimestampSchema.optional(),
  contentHash: z.string().min(1).optional(),
  reliability: UnitIntervalSchema.optional(),
  primary: z.boolean().default(false),
  notes: z.string().default(''),
});

export const EpistemicStateSchema = z.object({
  kind: EpistemicKindSchema,
  confidence: UnitIntervalSchema.default(0.5),
  verification: VerificationStateSchema.default('unverified'),
  uncertaintyReasons: z.array(z.string().min(1)).default([]),
  provenance: z.array(ProvenanceRefSchema).default([]),
  evidenceForNodeIds: z.array(z.string().min(1)).default([]),
  evidenceAgainstNodeIds: z.array(z.string().min(1)).default([]),
  lastVerifiedAt: TimestampSchema.optional(),
  temporal: TemporalValiditySchema,
});

export const VisibilitySchema = z.enum([
  'public',
  'internal',
  'confidential',
  'restricted',
]);

export const GovernanceEnvelopeSchema = z
  .object({
    visibility: VisibilitySchema.default('internal'),
    readableByAgentIds: z.array(z.string().min(1)).default([]),
    writableByAgentIds: z.array(z.string().min(1)).default([]),
    readableByDepartmentIds: z.array(z.string().min(1)).default([]),
    writableByDepartmentIds: z.array(z.string().min(1)).default([]),
    humanApprovalRequired: z.boolean().default(false),
    immutable: z.boolean().default(false),
    legalHold: z.boolean().default(false),
  })
  .default({});

export const AuditStampSchema = z
  .object({
    createdAt: TimestampSchema.optional(),
    updatedAt: TimestampSchema.optional(),
    createdBy: BrainActorSchema.optional(),
    updatedBy: BrainActorSchema.optional(),
  })
  .default({});

export type BrainActor = z.infer<typeof BrainActorSchema>;
export type ContextEnvelope = z.infer<typeof ContextEnvelopeSchema>;
export type EpistemicKind = z.infer<typeof EpistemicKindSchema>;
export type EpistemicState = z.infer<typeof EpistemicStateSchema>;
export type ErrorClass = z.infer<typeof ErrorClassSchema>;
export type ProvenanceRef = z.infer<typeof ProvenanceRefSchema>;
