import type {
  BrainGraph,
  BrainGraphNode,
} from '@/lib/brain/graph-schema';

import {
  requireNode,
} from '@/lib/brain/graph-ops';

import {
  decayedRetention,
} from '@/lib/brain/memory-dynamics';

function jaccard(
  left: Iterable<string>,
  right: Iterable<string>,
): number {
  const a = new Set(left);
  const b = new Set(right);

  if (a.size === 0 && b.size === 0) return 0;

  let intersection = 0;
  for (const value of a) {
    if (b.has(value)) intersection += 1;
  }

  const union = new Set([...a, ...b]).size;
  return union === 0 ? 0 : intersection / union;
}

function contextTokens(node: BrainGraphNode): string[] {
  return [
    ...node.context.departmentIds.map((x) => `department:${x}`),
    ...node.context.agentIds.map((x) => `agent:${x}`),
    ...node.context.assetIds.map((x) => `asset:${x}`),
    ...node.context.instrumentIds.map((x) => `instrument:${x}`),
    ...node.context.portfolioIds.map((x) => `portfolio:${x}`),
    ...node.context.horizons.map((x) => `horizon:${x}`),
    ...node.context.marketRegimes.map((x) => `regime:${x}`),
    ...node.context.scenarios.map((x) => `scenario:${x}`),
    ...node.tags.map((x) => `tag:${x}`),
  ];
}

export function findConsolidationCandidates(
  graph: BrainGraph,
): BrainGraphNode[] {
  return graph.nodes.filter(
    (node) =>
      node.memory?.stage === 'lesson_candidate' &&
      node.status !== 'archived' &&
      node.status !== 'superseded',
  );
}

export function findProspectiveMemories(
  graph: BrainGraph,
): BrainGraphNode[] {
  return graph.nodes.filter(
    (node) =>
      node.memory?.system === 'prospective' &&
      ['planned', 'pending', 'active'].includes(node.status),
  );
}

export function findArchiveCandidates(
  graph: BrainGraph,
  now: string,
  retentionThreshold: number,
): BrainGraphNode[] {
  if (
    !Number.isFinite(retentionThreshold) ||
    retentionThreshold < 0 ||
    retentionThreshold > 1
  ) {
    throw new Error('retentionThreshold must be between 0 and 1');
  }

  return graph.nodes.filter((node) => {
    if (
      !node.memory ||
      node.memory.retentionLock ||
      node.memory.system === 'structural' ||
      node.status === 'archived'
    ) {
      return false;
    }

    return decayedRetention(node, now) <= retentionThreshold;
  });
}

export type AnalogyCandidate = {
  node: BrainGraphNode;
  score: number;
  sharedContext: number;
  sameType: boolean;
  sameMemorySystem: boolean;
};

export function findAnalogies(
  graph: BrainGraph,
  nodeId: string,
  options: {
    limit?: number;
    minimumScore?: number;
  } = {},
): AnalogyCandidate[] {
  const source = requireNode(graph, nodeId);
  const limit = options.limit ?? 10;
  const minimumScore = options.minimumScore ?? 0.15;
  const sourceContext = contextTokens(source);

  return graph.nodes
    .filter((candidate) => candidate.id !== source.id)
    .map((candidate) => {
      const sharedContext = jaccard(
        sourceContext,
        contextTokens(candidate),
      );

      const sameType = candidate.type === source.type;
      const sameMemorySystem =
        candidate.memory?.system !== undefined &&
        candidate.memory.system === source.memory?.system;

      const score = Math.min(
        1,
        sharedContext * 0.7 +
          (sameType ? 0.2 : 0) +
          (sameMemorySystem ? 0.1 : 0),
      );

      return {
        node: candidate,
        score,
        sharedContext,
        sameType,
        sameMemorySystem,
      };
    })
    .filter((candidate) => candidate.score >= minimumScore)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.node.label.localeCompare(b.node.label),
    )
    .slice(0, limit);
}

export function repeatedErrorPatterns(
  graph: BrainGraph,
) {
  const groups = new Map<string, string[]>();

  for (const node of graph.nodes) {
    if (node.type !== 'error' || !node.errorClass) continue;

    const context = [
      node.errorClass,
      ...node.context.assetIds.map((id) => `asset:${id}`),
      ...node.context.marketRegimes.map((id) => `regime:${id}`),
      ...node.context.horizons.map((id) => `horizon:${id}`),
    ].join('|');

    const ids = groups.get(context) ?? [];
    ids.push(node.id);
    groups.set(context, ids);
  }

  return [...groups.entries()]
    .filter(([, ids]) => ids.length >= 2)
    .map(([patternKey, nodeIds]) => ({ patternKey, nodeIds }));
}
