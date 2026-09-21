import { z } from 'zod';

import {
  AuditStampSchema,
  ContextEnvelopeSchema,
  EpistemicStateSchema,
  ErrorClassSchema,
  GovernanceEnvelopeSchema,
  ProvenanceRefSchema,
  TimestampSchema,
  UnitIntervalSchema,
} from '@/lib/brain/core-schema';

import {
  MemoryTraceSchema,
} from '@/lib/brain/memory-schema';

export const BrainGraphNodeTypeSchema = z.enum([
  'brain',
  'department',
  'agent',
  'human',
  'goal',
  'task',
  'workflow',
  'policy',
  'sop',
  'tool',
  'provider',
  'dataset',
  'source',
  'evidence',
  'fact',
  'interpretation',
  'assumption',
  'thesis',
  'hypothesis',
  'question',
  'prediction',
  'counterfactual',
  'concept',
  'event',
  'experience',
  'decision',
  'outcome',
  'error',
  'lesson_candidate',
  'validated_lesson',
  'post_mortem',
  'asset',
  'instrument',
  'portfolio',
  'position',
  'proposal',
  'risk_ticket',
  'metric',
  'alert',
]);

export const BrainGraphNodeStatusSchema = z.enum([
  'planned',
  'pending',
  'active',
  'validated',
  'rejected',
  'invalidated',
  'superseded',
  'archived',
  'closed',
]);

export const BrainGraphEdgeTypeSchema = z.enum([
  'contains',
  'belongs_to',
  'reports_to',
  'supervises',
  'owns',
  'assigned_to',
  'created_by',
  'produced_by',
  'proposed_by',
  'reviewed_by',
  'approved_by',
  'rejected_by',
  'part_of',
  'depends_on',
  'precedes',
  'triggers',
  'observed_in',
  'references',
  'based_on',
  'supports',
  'contradicts',
  'invalidates',
  'corrects',
  'supersedes',
  'derived_from',
  'summarizes',
  'learned_from',
  'validated_by',
  'generalizes_to',
  'failed_because',
  'causes',
  'contributes_to',
  'resulted_in',
  'mitigates',
  'predicts',
  'tests',
  'explains',
  'concerns',
  'affects',
  'exposed_to',
  'benchmarked_against',
  'measured_by',
  'is_a',
  'instance_of',
  'similar_to',
  'related_to',
  'shares_memory_with',
  'retrieved_with',
]);

export const BrainGraphEdgeStatusSchema = z.enum([
  'active',
  'superseded',
  'archived',
]);

export const BrainGraphNodeSchema = z.object({
  id: z.string().min(1),
  type: BrainGraphNodeTypeSchema,
  label: z.string().min(1),
  summary: z.string().default(''),
  content: z.string().default(''),
  rationaleSummary: z.string().default(''),
  status: BrainGraphNodeStatusSchema.default('active'),
  canonicalKey: z.string().min(1).optional(),
  tags: z.array(z.string().min(1)).default([]),
  keywords: z.array(z.string().min(1)).default([]),
  context: ContextEnvelopeSchema,
  epistemic: EpistemicStateSchema.optional(),
  errorClass: ErrorClassSchema.optional(),
  memory: MemoryTraceSchema.optional(),
  governance: GovernanceEnvelopeSchema,
  audit: AuditStampSchema,
  version: z.number().int().positive().default(1),
  metadata: z.record(z.unknown()).default({}),
});

export const BrainGraphNodePatchSchema =
  BrainGraphNodeSchema.partial().omit({ id: true });

export const BrainGraphEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  type: BrainGraphEdgeTypeSchema,
  directed: z.boolean().default(true),
  strength: UnitIntervalSchema.default(1),
  confidence: UnitIntervalSchema.optional(),
  status: BrainGraphEdgeStatusSchema.default('active'),
  label: z.string().optional(),
  context: ContextEnvelopeSchema,
  provenance: z.array(ProvenanceRefSchema).default([]),
  validFrom: TimestampSchema.optional(),
  validUntil: TimestampSchema.optional(),
  metadata: z.record(z.unknown()).default({}),
});

export const BrainGraphSchema = z
  .object({
    schemaVersion: z.literal(1),
    graphId: z.string().min(1),
    revision: z.number().int().min(0).default(0),
    generatedAt: TimestampSchema,
    nodes: z.array(BrainGraphNodeSchema),
    edges: z.array(BrainGraphEdgeSchema),
    metadata: z.record(z.unknown()).default({}),
  })
  .superRefine((graph, ctx) => {
    const nodeIds = new Set<string>();

    graph.nodes.forEach((node, index) => {
      if (nodeIds.has(node.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['nodes', index, 'id'],
          message: `Duplicate graph node id: ${node.id}`,
        });
      }
      nodeIds.add(node.id);
    });

    const edgeIds = new Set<string>();
    const semanticEdges = new Set<string>();

    graph.edges.forEach((edge, index) => {
      if (edgeIds.has(edge.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['edges', index, 'id'],
          message: `Duplicate graph edge id: ${edge.id}`,
        });
      }
      edgeIds.add(edge.id);

      if (!nodeIds.has(edge.source)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['edges', index, 'source'],
          message: `Unknown graph source node: ${edge.source}`,
        });
      }

      if (!nodeIds.has(edge.target)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['edges', index, 'target'],
          message: `Unknown graph target node: ${edge.target}`,
        });
      }

      if (edge.source === edge.target) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['edges', index],
          message: `Self-referential graph edge is not allowed: ${edge.id}`,
        });
      }

      if (
        edge.validFrom &&
        edge.validUntil &&
        Date.parse(edge.validUntil) < Date.parse(edge.validFrom)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['edges', index, 'validUntil'],
          message: 'validUntil cannot be earlier than validFrom',
        });
      }

      const endpoints = edge.directed
        ? `${edge.source}->${edge.target}`
        : [edge.source, edge.target].sort().join('<->');

      const semanticKey = `${edge.type}|${endpoints}|${edge.status}`;

      if (semanticEdges.has(semanticKey)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['edges', index],
          message: `Duplicate semantic edge: ${semanticKey}`,
        });
      }
      semanticEdges.add(semanticKey);
    });
  });

export type BrainGraphNodeType = z.infer<typeof BrainGraphNodeTypeSchema>;
export type BrainGraphNodeStatus = z.infer<typeof BrainGraphNodeStatusSchema>;
export type BrainGraphEdgeType = z.infer<typeof BrainGraphEdgeTypeSchema>;
export type BrainGraphNode = z.infer<typeof BrainGraphNodeSchema>;
export type BrainGraphNodeInput = z.input<typeof BrainGraphNodeSchema>;
export type BrainGraphNodePatchInput = z.input<typeof BrainGraphNodePatchSchema>;
export type BrainGraphEdge = z.infer<typeof BrainGraphEdgeSchema>;
export type BrainGraphEdgeInput = z.input<typeof BrainGraphEdgeSchema>;
export type BrainGraph = z.infer<typeof BrainGraphSchema>;
export type BrainGraphInput = z.input<typeof BrainGraphSchema>;
