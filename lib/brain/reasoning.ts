import type {
  BrainGraph,
  BrainGraphEdge,
  BrainGraphNode,
} from '@/lib/brain/graph-schema';

import {
  requireNode,
} from '@/lib/brain/graph-ops';

const CAUSAL_EDGE_TYPES = new Set([
  'causes',
  'contributes_to',
  'resulted_in',
  'mitigates',
  'failed_because',
  'explains',
]);

function evidenceWeight(
  graph: BrainGraph,
  edge: BrainGraphEdge,
): number {
  const source = graph.nodes.find(
    (node) => node.id === edge.source,
  );

  return (
    edge.strength *
    (edge.confidence ?? 1) *
    (source?.epistemic?.confidence ?? 0.5)
  );
}

export function evidenceBalance(
  graph: BrainGraph,
  targetNodeId: string,
) {
  requireNode(graph, targetNodeId);

  const supporting = graph.edges.filter(
    (edge) =>
      edge.target === targetNodeId &&
      edge.type === 'supports' &&
      edge.status === 'active',
  );

  const contradicting = graph.edges.filter(
    (edge) =>
      edge.target === targetNodeId &&
      edge.type === 'contradicts' &&
      edge.status === 'active',
  );

  const supportScore = supporting.reduce(
    (sum, edge) => sum + evidenceWeight(graph, edge),
    0,
  );

  const contradictionScore = contradicting.reduce(
    (sum, edge) => sum + evidenceWeight(graph, edge),
    0,
  );

  const total = supportScore + contradictionScore;

  return {
    targetNodeId,
    supportScore,
    contradictionScore,
    normalizedSupport:
      total === 0 ? 0 : supportScore / total,
    normalizedContradiction:
      total === 0 ? 0 : contradictionScore / total,
    netEvidence: supportScore - contradictionScore,
    supportingNodeIds: supporting.map((edge) => edge.source),
    contradictingNodeIds: contradicting.map((edge) => edge.source),
  };
}

export function causalNeighborhood(
  graph: BrainGraph,
  nodeId: string,
  direction: 'upstream' | 'downstream',
  maxHops = 4,
): Set<string> {
  requireNode(graph, nodeId);

  const visited = new Set<string>([nodeId]);
  let frontier = new Set<string>([nodeId]);

  for (let depth = 0; depth < maxHops; depth += 1) {
    const nextFrontier = new Set<string>();

    for (const current of frontier) {
      for (const edge of graph.edges) {
        if (
          edge.status !== 'active' ||
          !CAUSAL_EDGE_TYPES.has(edge.type)
        ) {
          continue;
        }

        const next =
          direction === 'upstream'
            ? edge.target === current
              ? edge.source
              : null
            : edge.source === current
              ? edge.target
              : null;

        if (next && !visited.has(next)) {
          visited.add(next);
          nextFrontier.add(next);
        }
      }
    }

    frontier = nextFrontier;
    if (frontier.size === 0) break;
  }

  return visited;
}

export function findUnresolvedContradictions(
  graph: BrainGraph,
): BrainGraphEdge[] {
  const inactive = new Set([
    'superseded',
    'invalidated',
    'archived',
    'rejected',
  ]);

  return graph.edges.filter((edge) => {
    if (
      edge.type !== 'contradicts' ||
      edge.status !== 'active'
    ) {
      return false;
    }

    const source = graph.nodes.find(
      (node) => node.id === edge.source,
    );
    const target = graph.nodes.find(
      (node) => node.id === edge.target,
    );

    return (
      source !== undefined &&
      target !== undefined &&
      !inactive.has(source.status) &&
      !inactive.has(target.status)
    );
  });
}

export function findOpenQuestions(
  graph: BrainGraph,
): BrainGraphNode[] {
  return graph.nodes.filter((node) => {
    if (
      node.type !== 'question' ||
      node.status === 'closed' ||
      node.status === 'archived'
    ) {
      return false;
    }

    return !graph.edges.some(
      (edge) =>
        edge.status === 'active' &&
        edge.target === node.id &&
        ['supports', 'explains', 'validated_by'].includes(edge.type),
    );
  });
}

export function findKnowledgeGaps(
  graph: BrainGraph,
) {
  const ungroundedHypothesisIds = graph.nodes
    .filter((node) => node.type === 'hypothesis')
    .filter(
      (node) =>
        !graph.edges.some(
          (edge) =>
            edge.status === 'active' &&
            (edge.source === node.id || edge.target === node.id) &&
            ['supports', 'contradicts', 'based_on', 'tests'].includes(
              edge.type,
            ),
        ),
    )
    .map((node) => node.id);

  const sourceLessFactIds = graph.nodes
    .filter(
      (node) =>
        node.type === 'fact' &&
        (node.epistemic?.provenance.length ?? 0) === 0,
    )
    .map((node) => node.id);

  const decisionWithoutBasisIds = graph.nodes
    .filter((node) => node.type === 'decision')
    .filter(
      (node) =>
        !graph.edges.some(
          (edge) =>
            edge.status === 'active' &&
            edge.source === node.id &&
            edge.type === 'based_on',
        ),
    )
    .map((node) => node.id);

  return {
    openQuestionIds: findOpenQuestions(graph).map((node) => node.id),
    ungroundedHypothesisIds,
    sourceLessFactIds,
    decisionWithoutBasisIds,
  };
}
