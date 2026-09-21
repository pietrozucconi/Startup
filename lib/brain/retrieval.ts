import { z } from 'zod';

import {
  EpistemicKindSchema,
  TimestampSchema,
  UnitIntervalSchema,
} from '@/lib/brain/core-schema';

import {
  BrainGraphNodeTypeSchema,
  type BrainGraph,
  type BrainGraphEdge,
  type BrainGraphNode,
} from '@/lib/brain/graph-schema';

import {
  MemorySystemSchema,
  WorkingMemoryFrameSchema,
  type WorkingMemoryFrame,
} from '@/lib/brain/memory-schema';

import {
  compositeSalience,
  decayedRetention,
} from '@/lib/brain/memory-dynamics';

export const BrainRetrievalQuerySchema = z.object({
  text: z.string().default(''),
  nodeTypes: z.array(BrainGraphNodeTypeSchema).default([]),
  memorySystems: z.array(MemorySystemSchema).default([]),
  epistemicKinds: z.array(EpistemicKindSchema).default([]),
  departmentIds: z.array(z.string().min(1)).default([]),
  agentIds: z.array(z.string().min(1)).default([]),
  assetIds: z.array(z.string().min(1)).default([]),
  tags: z.array(z.string().min(1)).default([]),
  seedNodeIds: z.array(z.string().min(1)).default([]),
  minConfidence: UnitIntervalSchema.optional(),
  includeArchived: z.boolean().default(false),
  includeSuperseded: z.boolean().default(false),
  maxHops: z.number().int().min(0).max(12).default(3),
  limit: z.number().int().positive().max(200).default(20),
  asOf: TimestampSchema.optional(),
});

export const BrainRetrievalWeightsSchema = z.object({
  text: z.number().finite().min(0),
  salience: z.number().finite().min(0),
  activation: z.number().finite().min(0),
  confidence: z.number().finite().min(0),
  retention: z.number().finite().min(0),
  recency: z.number().finite().min(0),
  graphProximity: z.number().finite().min(0),
});

export const DEFAULT_RETRIEVAL_WEIGHTS = {
  text: 0.30,
  salience: 0.13,
  activation: 0.13,
  confidence: 0.13,
  retention: 0.10,
  recency: 0.08,
  graphProximity: 0.13,
} as const;

export type BrainRetrievalQuery = z.infer<typeof BrainRetrievalQuerySchema>;
export type BrainRetrievalQueryInput = z.input<typeof BrainRetrievalQuerySchema>;
export type BrainRetrievalWeights = z.infer<typeof BrainRetrievalWeightsSchema>;

export type BrainRetrievalScoreBreakdown = {
  text: number;
  salience: number;
  activation: number;
  confidence: number;
  retention: number;
  recency: number;
  graphProximity: number;
};

export type BrainRetrievalResult = {
  node: BrainGraphNode;
  score: number;
  breakdown: BrainRetrievalScoreBreakdown;
  reasons: string[];
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 2),
  );
}

function lexicalScore(node: BrainGraphNode, queryText: string): number {
  const queryTokens = tokenize(queryText);
  if (queryTokens.size === 0) return 0;

  const haystack = tokenize(
    [
      node.label,
      node.summary,
      node.content,
      ...node.tags,
      ...node.keywords,
    ].join(' '),
  );

  let matches = 0;
  for (const token of queryTokens) {
    if (haystack.has(token)) matches += 1;
  }

  return matches / queryTokens.size;
}

function recencyScore(node: BrainGraphNode, now: string): number {
  const updatedAt = node.audit.updatedAt ?? node.audit.createdAt;
  if (!updatedAt) return 0.5;

  const ageDays = Math.max(
    0,
    (Date.parse(now) - Date.parse(updatedAt)) /
      (1000 * 60 * 60 * 24),
  );

  return Math.exp(-ageDays / 90);
}

function contextMatches(
  node: BrainGraphNode,
  query: BrainRetrievalQuery,
): boolean {
  const overlaps = (wanted: string[], actual: string[]) =>
    wanted.length === 0 || wanted.some((value) => actual.includes(value));

  return (
    overlaps(query.departmentIds, node.context.departmentIds) &&
    overlaps(query.agentIds, node.context.agentIds) &&
    overlaps(query.assetIds, node.context.assetIds) &&
    overlaps(query.tags, [...node.tags, ...node.context.tags])
  );
}

function edgeNeighbor(edge: BrainGraphEdge, nodeId: string): string | null {
  if (edge.source === nodeId) return edge.target;
  if (edge.target === nodeId) return edge.source;
  return null;
}

export function spreadActivation(
  graph: BrainGraph,
  seedNodeIds: string[],
  maxHops: number,
  decayPerHop = 0.65,
): Map<string, number> {
  const activation = new Map<string, number>();
  const queue: Array<{
    nodeId: string;
    value: number;
    depth: number;
  }> = [];

  for (const seedNodeId of seedNodeIds) {
    if (!graph.nodes.some((node) => node.id === seedNodeId)) continue;

    activation.set(seedNodeId, 1);
    queue.push({ nodeId: seedNodeId, value: 1, depth: 0 });
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.depth >= maxHops) continue;

    for (const edge of graph.edges) {
      if (edge.status !== 'active') continue;

      const nextNodeId = edgeNeighbor(edge, current.nodeId);
      if (!nextNodeId) continue;

      const nextActivation =
        current.value *
        decayPerHop *
        edge.strength *
        (edge.confidence ?? 1);

      const previous = activation.get(nextNodeId) ?? 0;
      if (nextActivation <= previous) continue;

      activation.set(nextNodeId, clamp01(nextActivation));
      queue.push({
        nodeId: nextNodeId,
        value: nextActivation,
        depth: current.depth + 1,
      });
    }
  }

  return activation;
}

function matchesHardFilters(
  node: BrainGraphNode,
  query: BrainRetrievalQuery,
): boolean {
  if (!query.includeArchived && node.status === 'archived') return false;
  if (!query.includeSuperseded && node.status === 'superseded') return false;

  if (
    query.nodeTypes.length > 0 &&
    !query.nodeTypes.includes(node.type)
  ) {
    return false;
  }

  if (
    query.memorySystems.length > 0 &&
    (!node.memory || !query.memorySystems.includes(node.memory.system))
  ) {
    return false;
  }

  if (
    query.epistemicKinds.length > 0 &&
    (!node.epistemic || !query.epistemicKinds.includes(node.epistemic.kind))
  ) {
    return false;
  }

  if (
    query.minConfidence !== undefined &&
    (node.epistemic?.confidence ?? 0) < query.minConfidence
  ) {
    return false;
  }

  return contextMatches(node, query);
}

function normalizedWeightedScore(
  breakdown: BrainRetrievalScoreBreakdown,
  weights: BrainRetrievalWeights,
): number {
  const entries = Object.entries(weights) as Array<
    [keyof BrainRetrievalWeights, number]
  >;

  const totalWeight = entries.reduce((sum, [, weight]) => sum + weight, 0);
  if (totalWeight <= 0) return 0;

  const weighted = entries.reduce(
    (sum, [key, weight]) => sum + breakdown[key] * weight,
    0,
  );

  return clamp01(weighted / totalWeight);
}

export function retrieveBrainGraph(
  graph: BrainGraph,
  queryInput: BrainRetrievalQueryInput,
  options: {
    now?: string;
    weights?: BrainRetrievalWeights;
  } = {},
): BrainRetrievalResult[] {
  const query = BrainRetrievalQuerySchema.parse(queryInput);
  const weights = BrainRetrievalWeightsSchema.parse(
    options.weights ?? DEFAULT_RETRIEVAL_WEIGHTS,
  );
  const now = options.now ?? query.asOf ?? new Date().toISOString();

  const graphActivation = spreadActivation(
    graph,
    query.seedNodeIds,
    query.maxHops,
  );

  const results: BrainRetrievalResult[] = [];

  for (const node of graph.nodes) {
    if (!matchesHardFilters(node, query)) continue;

    const breakdown: BrainRetrievalScoreBreakdown = {
      text: lexicalScore(node, query.text),
      salience: compositeSalience(node),
      activation: Math.max(
        node.memory?.activation ?? 0,
        graphActivation.get(node.id) ?? 0,
      ),
      confidence: node.epistemic?.confidence ?? 0.5,
      retention: decayedRetention(node, now),
      recency: recencyScore(node, now),
      graphProximity: graphActivation.get(node.id) ?? 0,
    };

    const score = normalizedWeightedScore(breakdown, weights);
    const reasons: string[] = [];

    if (breakdown.text > 0) reasons.push('text_match');
    if (breakdown.graphProximity > 0) reasons.push('graph_proximity');
    if (breakdown.salience >= 0.5) reasons.push('high_salience');
    if (breakdown.confidence >= 0.75) reasons.push('high_confidence');
    if (breakdown.retention >= 0.75) reasons.push('strong_memory');

    results.push({ node, score, breakdown, reasons });
  }

  return results
    .sort(
      (a, b) =>
        b.score - a.score || a.node.label.localeCompare(b.node.label),
    )
    .slice(0, query.limit);
}

export function buildWorkingMemoryFrame(
  results: BrainRetrievalResult[],
  input: {
    id: string;
    purpose: string;
    capacity: number;
    createdAt?: string;
    expiresAt?: string;
    cueNodeIds?: string[];
    goalNodeIds?: string[];
    suppressedNodeIds?: string[];
  },
): WorkingMemoryFrame {
  const cueNodeIds = input.cueNodeIds ?? [];
  const goalNodeIds = input.goalNodeIds ?? [];
  const reserved = new Set([...cueNodeIds, ...goalNodeIds]).size;
  const focusCapacity = Math.max(0, input.capacity - reserved);

  return WorkingMemoryFrameSchema.parse({
    id: input.id,
    purpose: input.purpose,
    capacity: input.capacity,
    focusNodeIds: results
      .map((result) => result.node.id)
      .filter((id) => !cueNodeIds.includes(id) && !goalNodeIds.includes(id))
      .slice(0, focusCapacity),
    cueNodeIds,
    goalNodeIds,
    suppressedNodeIds: input.suppressedNodeIds ?? [],
    attentionBudget: 1,
    context: {},
    createdAt: input.createdAt ?? new Date().toISOString(),
    expiresAt: input.expiresAt,
  });
}
