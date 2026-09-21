import {
  BrainGraphEdgeSchema,
  BrainGraphNodeSchema,
  BrainGraphSchema,
  type BrainGraph,
  type BrainGraphEdge,
  type BrainGraphEdgeInput,
  type BrainGraphNode,
  type BrainGraphNodeInput,
  type BrainGraphNodePatchInput,
  type BrainGraphNodeType,
} from '@/lib/brain/graph-schema';

export type GraphTraversalOptions = {
  respectDirection?: boolean;
};

export type RemoveNodeOptions = {
  cascade?: boolean;
};

function nowIso(): string {
  return new Date().toISOString();
}

function stamp(
  graph: BrainGraph,
  nodes: BrainGraphNode[],
  edges: BrainGraphEdge[],
  at = nowIso(),
): BrainGraph {
  return BrainGraphSchema.parse({
    ...graph,
    revision: graph.revision + 1,
    generatedAt: at,
    nodes,
    edges,
  });
}

function adjacentNodeId(
  edge: BrainGraphEdge,
  nodeId: string,
  respectDirection: boolean,
): string | null {
  if (edge.directed && respectDirection) {
    return edge.source === nodeId ? edge.target : null;
  }

  if (edge.source === nodeId) return edge.target;
  if (edge.target === nodeId) return edge.source;
  return null;
}

function semanticEdgeKey(edge: BrainGraphEdge): string {
  const endpoints = edge.directed
    ? `${edge.source}->${edge.target}`
    : [edge.source, edge.target].sort().join('<->');

  return `${edge.type}|${endpoints}|${edge.status}`;
}

function dedupeEdges(edges: BrainGraphEdge[]): BrainGraphEdge[] {
  const seen = new Map<string, BrainGraphEdge>();

  for (const edge of edges) {
    if (edge.source === edge.target) continue;

    const key = semanticEdgeKey(edge);
    const existing = seen.get(key);

    if (!existing || edge.strength > existing.strength) {
      seen.set(key, edge);
    }
  }

  return [...seen.values()];
}

export function createEmptyBrainGraph(
  graphId = 'startup-brain',
  generatedAt = nowIso(),
): BrainGraph {
  return BrainGraphSchema.parse({
    schemaVersion: 1,
    graphId,
    revision: 0,
    generatedAt,
    nodes: [],
    edges: [],
    metadata: {},
  });
}

export function validateBrainGraph(graph: unknown): BrainGraph {
  return BrainGraphSchema.parse(graph);
}

export function getNode(
  graph: BrainGraph,
  nodeId: string,
): BrainGraphNode | undefined {
  return graph.nodes.find((node) => node.id === nodeId);
}

export function requireNode(
  graph: BrainGraph,
  nodeId: string,
): BrainGraphNode {
  const node = getNode(graph, nodeId);
  if (!node) throw new Error(`Unknown brain node: ${nodeId}`);
  return node;
}

export function getEdge(
  graph: BrainGraph,
  edgeId: string,
): BrainGraphEdge | undefined {
  return graph.edges.find((edge) => edge.id === edgeId);
}

export function incomingEdges(
  graph: BrainGraph,
  nodeId: string,
): BrainGraphEdge[] {
  return graph.edges.filter(
    (edge) =>
      edge.target === nodeId ||
      (!edge.directed && edge.source === nodeId),
  );
}

export function outgoingEdges(
  graph: BrainGraph,
  nodeId: string,
): BrainGraphEdge[] {
  return graph.edges.filter(
    (edge) =>
      edge.source === nodeId ||
      (!edge.directed && edge.target === nodeId),
  );
}

export function incidentEdges(
  graph: BrainGraph,
  nodeId: string,
): BrainGraphEdge[] {
  return graph.edges.filter(
    (edge) =>
      edge.source === nodeId || edge.target === nodeId,
  );
}

export function addNode(
  graph: BrainGraph,
  nodeInput: BrainGraphNodeInput,
  at?: string,
): BrainGraph {
  const node = BrainGraphNodeSchema.parse(nodeInput);

  if (getNode(graph, node.id)) {
    throw new Error(`Brain node already exists: ${node.id}`);
  }

  return stamp(graph, [...graph.nodes, node], graph.edges, at);
}

export function updateNode(
  graph: BrainGraph,
  nodeId: string,
  patch: BrainGraphNodePatchInput,
  at?: string,
): BrainGraph {
  const existing = requireNode(graph, nodeId);

  const next = BrainGraphNodeSchema.parse({
    ...existing,
    ...patch,
    id: existing.id,
    context: patch.context ?? existing.context,
    epistemic: patch.epistemic ?? existing.epistemic,
    memory: patch.memory ?? existing.memory,
    governance: patch.governance ?? existing.governance,
    audit: patch.audit ?? existing.audit,
    metadata: {
      ...existing.metadata,
      ...(patch.metadata ?? {}),
    },
    version: existing.version + 1,
  });

  return stamp(
    graph,
    graph.nodes.map((node) => (node.id === nodeId ? next : node)),
    graph.edges,
    at,
  );
}

export function removeNode(
  graph: BrainGraph,
  nodeId: string,
  options: RemoveNodeOptions = {},
  at?: string,
): BrainGraph {
  requireNode(graph, nodeId);

  const incident = incidentEdges(graph, nodeId);

  if (incident.length > 0 && !options.cascade) {
    throw new Error(
      `Cannot remove ${nodeId}: ${incident.length} incident edges remain`,
    );
  }

  return stamp(
    graph,
    graph.nodes.filter((node) => node.id !== nodeId),
    options.cascade
      ? graph.edges.filter(
          (edge) =>
            edge.source !== nodeId && edge.target !== nodeId,
        )
      : graph.edges,
    at,
  );
}

export function addEdge(
  graph: BrainGraph,
  edgeInput: BrainGraphEdgeInput,
  at?: string,
): BrainGraph {
  const edge = BrainGraphEdgeSchema.parse(edgeInput);

  requireNode(graph, edge.source);
  requireNode(graph, edge.target);

  if (getEdge(graph, edge.id)) {
    throw new Error(`Brain edge already exists: ${edge.id}`);
  }

  return stamp(graph, graph.nodes, [...graph.edges, edge], at);
}

export function removeEdge(
  graph: BrainGraph,
  edgeId: string,
  at?: string,
): BrainGraph {
  if (!getEdge(graph, edgeId)) {
    throw new Error(`Unknown brain edge: ${edgeId}`);
  }

  return stamp(
    graph,
    graph.nodes,
    graph.edges.filter((edge) => edge.id !== edgeId),
    at,
  );
}

export function findNodesByType(
  graph: BrainGraph,
  type: BrainGraphNodeType,
): BrainGraphNode[] {
  return graph.nodes.filter((node) => node.type === type);
}

export function neighbors(
  graph: BrainGraph,
  nodeId: string,
  options: GraphTraversalOptions = {},
): BrainGraphNode[] {
  requireNode(graph, nodeId);
  const respectDirection = options.respectDirection ?? false;
  const ids = new Set<string>();

  for (const edge of graph.edges) {
    const adjacent = adjacentNodeId(edge, nodeId, respectDirection);
    if (adjacent) ids.add(adjacent);
  }

  return graph.nodes.filter((node) => ids.has(node.id));
}

export function shortestPath(
  graph: BrainGraph,
  startNodeId: string,
  endNodeId: string,
  options: GraphTraversalOptions = {},
): string[] | null {
  requireNode(graph, startNodeId);
  requireNode(graph, endNodeId);

  if (startNodeId === endNodeId) return [startNodeId];

  const respectDirection = options.respectDirection ?? false;
  const queue: string[] = [startNodeId];
  const previous = new Map<string, string | null>([[startNodeId, null]]);

  while (queue.length > 0) {
    const current = queue.shift()!;

    for (const edge of graph.edges) {
      const next = adjacentNodeId(edge, current, respectDirection);
      if (!next || previous.has(next)) continue;

      previous.set(next, current);

      if (next === endNodeId) {
        const path: string[] = [];
        let cursor: string | null = endNodeId;

        while (cursor) {
          path.push(cursor);
          cursor = previous.get(cursor) ?? null;
        }

        return path.reverse();
      }

      queue.push(next);
    }
  }

  return null;
}

export function kHopNodeIds(
  graph: BrainGraph,
  seedNodeIds: string[],
  hops: number,
  options: GraphTraversalOptions = {},
): Set<string> {
  const visited = new Set<string>();
  let frontier = new Set<string>();

  for (const seed of seedNodeIds) {
    requireNode(graph, seed);
    visited.add(seed);
    frontier.add(seed);
  }

  for (let depth = 0; depth < hops; depth += 1) {
    const nextFrontier = new Set<string>();

    for (const nodeId of frontier) {
      for (const node of neighbors(graph, nodeId, options)) {
        if (!visited.has(node.id)) {
          visited.add(node.id);
          nextFrontier.add(node.id);
        }
      }
    }

    frontier = nextFrontier;
    if (frontier.size === 0) break;
  }

  return visited;
}

export function subgraphByNodeIds(
  graph: BrainGraph,
  nodeIds: Iterable<string>,
): BrainGraph {
  const included = new Set(nodeIds);

  return BrainGraphSchema.parse({
    ...graph,
    nodes: graph.nodes.filter((node) => included.has(node.id)),
    edges: graph.edges.filter(
      (edge) =>
        included.has(edge.source) && included.has(edge.target),
    ),
  });
}

export function kHopSubgraph(
  graph: BrainGraph,
  seedNodeIds: string[],
  hops: number,
  options: GraphTraversalOptions = {},
): BrainGraph {
  return subgraphByNodeIds(
    graph,
    kHopNodeIds(graph, seedNodeIds, hops, options),
  );
}

export function findContradictionEdges(
  graph: BrainGraph,
): BrainGraphEdge[] {
  return graph.edges.filter((edge) => edge.type === 'contradicts');
}

export function mergeNodes(
  graph: BrainGraph,
  canonicalNodeId: string,
  duplicateNodeIds: string[],
  at?: string,
): BrainGraph {
  const canonical = requireNode(graph, canonicalNodeId);
  const duplicates = new Set(
    duplicateNodeIds.filter((id) => id !== canonicalNodeId),
  );

  for (const duplicateId of duplicates) {
    requireNode(graph, duplicateId);
  }

  const priorMerged = Array.isArray(canonical.metadata.mergedNodeIds)
    ? canonical.metadata.mergedNodeIds.filter(
        (value): value is string => typeof value === 'string',
      )
    : [];

  const mergedNode = BrainGraphNodeSchema.parse({
    ...canonical,
    metadata: {
      ...canonical.metadata,
      mergedNodeIds: [...new Set([...priorMerged, ...duplicates])],
    },
    version: canonical.version + 1,
  });

  const nodes = graph.nodes
    .filter((node) => !duplicates.has(node.id))
    .map((node) =>
      node.id === canonicalNodeId ? mergedNode : node,
    );

  const rewired = graph.edges.map((edge) => ({
    ...edge,
    source: duplicates.has(edge.source)
      ? canonicalNodeId
      : edge.source,
    target: duplicates.has(edge.target)
      ? canonicalNodeId
      : edge.target,
  }));

  return stamp(graph, nodes, dedupeEdges(rewired), at);
}

export function graphStats(graph: BrainGraph) {
  const byNodeType = new Map<string, number>();
  const byEdgeType = new Map<string, number>();

  for (const node of graph.nodes) {
    byNodeType.set(node.type, (byNodeType.get(node.type) ?? 0) + 1);
  }

  for (const edge of graph.edges) {
    byEdgeType.set(edge.type, (byEdgeType.get(edge.type) ?? 0) + 1);
  }

  return {
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    byNodeType: Object.fromEntries(byNodeType),
    byEdgeType: Object.fromEntries(byEdgeType),
  };
}
