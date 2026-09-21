import type {
  BrainGraph,
  BrainGraphNode,
} from '@/lib/brain/graph-schema';

import {
  graphStats,
  incidentEdges,
} from '@/lib/brain/graph-ops';

const OPERATIONAL_TYPES = new Set([
  'event',
  'experience',
  'decision',
  'outcome',
  'error',
  'lesson_candidate',
  'validated_lesson',
  'post_mortem',
]);

function hasContext(node: BrainGraphNode): boolean {
  const context = node.context;

  return [
    context.departmentIds,
    context.agentIds,
    context.assetIds,
    context.instrumentIds,
    context.portfolioIds,
    context.workflowIds,
    context.decisionIds,
    context.taskIds,
    context.jurisdictions,
    context.horizons,
    context.marketRegimes,
    context.scenarios,
    context.tags,
  ].some((values) => values.length > 0);
}

function countConnectedComponents(graph: BrainGraph): number {
  const unseen = new Set(graph.nodes.map((node) => node.id));
  let components = 0;

  while (unseen.size > 0) {
    components += 1;
    const start = unseen.values().next().value as string;
    const stack = [start];
    unseen.delete(start);

    while (stack.length > 0) {
      const current = stack.pop()!;

      for (const edge of graph.edges) {
        let next: string | null = null;
        if (edge.source === current) next = edge.target;
        else if (edge.target === current) next = edge.source;

        if (next && unseen.has(next)) {
          unseen.delete(next);
          stack.push(next);
        }
      }
    }
  }

  return components;
}

export function inspectBrainGraph(
  graph: BrainGraph,
  now = new Date().toISOString(),
) {
  const duplicateCanonicalKeys = new Map<string, string[]>();

  for (const node of graph.nodes) {
    if (!node.canonicalKey) continue;

    const key = `${node.type}:${node.canonicalKey}`;
    const ids = duplicateCanonicalKeys.get(key) ?? [];
    ids.push(node.id);
    duplicateCanonicalKeys.set(key, ids);
  }

  const duplicateCanonicalKeyGroups = Object.fromEntries(
    [...duplicateCanonicalKeys.entries()].filter(([, ids]) => ids.length > 1),
  );

  const orphanNodeIds = graph.nodes
    .filter(
      (node) =>
        node.type !== 'brain' && incidentEdges(graph, node.id).length === 0,
    )
    .map((node) => node.id);

  const contradictionEdgeIds = graph.edges
    .filter((edge) => edge.type === 'contradicts')
    .map((edge) => edge.id);

  const disputedNodeIds = graph.nodes
    .filter(
      (node) =>
        node.epistemic?.verification === 'disputed' ||
        node.epistemic?.verification === 'retracted',
    )
    .map((node) => node.id);

  const expiredNodeIds = graph.nodes
    .filter((node) => {
      const validUntil = node.epistemic?.temporal.validUntil;
      return (
        validUntil !== undefined &&
        Date.parse(validUntil) < Date.parse(now)
      );
    })
    .map((node) => node.id);

  const unverifiedFactNodeIds = graph.nodes
    .filter(
      (node) =>
        node.type === 'fact' &&
        node.epistemic !== undefined &&
        node.epistemic.verification !== 'verified',
    )
    .map((node) => node.id);

  const validatedLessonsWithoutProvenance = graph.nodes
    .filter(
      (node) =>
        node.type === 'validated_lesson' &&
        (node.epistemic?.provenance.length ?? 0) === 0,
    )
    .map((node) => node.id);

  const operationalNodesWithoutContext = graph.nodes
    .filter(
      (node) => OPERATIONAL_TYPES.has(node.type) && !hasContext(node),
    )
    .map((node) => node.id);

  const supersedesTargets = new Set(
    graph.edges
      .filter(
        (edge) =>
          edge.type === 'supersedes' && edge.status === 'active',
      )
      .map((edge) => edge.target),
  );

  const activeNodesAlreadySuperseded = graph.nodes
    .filter(
      (node) =>
        supersedesTargets.has(node.id) &&
        node.status !== 'superseded' &&
        node.status !== 'archived',
    )
    .map((node) => node.id);

  const n = graph.nodes.length;
  const possibleUndirectedEdges = n > 1 ? (n * (n - 1)) / 2 : 0;

  return {
    generatedAt: now,
    stats: graphStats(graph),
    connectedComponents: countConnectedComponents(graph),
    approximateDensity:
      possibleUndirectedEdges === 0
        ? 0
        : graph.edges.length / possibleUndirectedEdges,
    orphanNodeIds,
    contradictionEdgeIds,
    disputedNodeIds,
    expiredNodeIds,
    unverifiedFactNodeIds,
    validatedLessonsWithoutProvenance,
    operationalNodesWithoutContext,
    activeNodesAlreadySuperseded,
    duplicateCanonicalKeyGroups,
  };
}
