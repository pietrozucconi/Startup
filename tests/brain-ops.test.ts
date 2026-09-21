import {
  describe,
  expect,
  test,
} from 'vitest';

import {
  addEdge,
  addNode,
  createEmptyBrainGraph,
  kHopNodeIds,
  mergeNodes,
  removeNode,
  shortestPath,
} from '@/lib/brain/graph-ops';

function concept(id: string, label = id) {
  return {
    id,
    type: 'concept' as const,
    label,
  };
}

describe('Startup Brain graph operations', () => {
  test('adds nodes and semantic edges safely', () => {
    let graph = createEmptyBrainGraph(
      'test',
      '2026-01-01T00:00:00.000Z',
    );

    graph = addNode(graph, concept('a'));
    graph = addNode(graph, concept('b'));

    graph = addEdge(graph, {
      id: 'e1',
      source: 'a',
      target: 'b',
      type: 'supports',
      directed: true,
      strength: 0.8,
    });

    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(1);
  });

  test('requires cascade before removing a connected node', () => {
    let graph = createEmptyBrainGraph(
      'test',
      '2026-01-01T00:00:00.000Z',
    );

    graph = addNode(graph, concept('a'));
    graph = addNode(graph, concept('b'));

    graph = addEdge(graph, {
      id: 'e1',
      source: 'a',
      target: 'b',
      type: 'related_to',
      directed: false,
    });

    expect(() => removeNode(graph, 'a')).toThrow();

    const removed = removeNode(
      graph,
      'a',
      { cascade: true },
    );

    expect(removed.nodes).toHaveLength(1);
    expect(removed.edges).toHaveLength(0);
  });

  test('finds paths and k-hop neighborhoods', () => {
    let graph = createEmptyBrainGraph(
      'test',
      '2026-01-01T00:00:00.000Z',
    );

    for (const id of ['a', 'b', 'c']) {
      graph = addNode(graph, concept(id));
    }

    graph = addEdge(graph, {
      id: 'ab',
      source: 'a',
      target: 'b',
      type: 'related_to',
      directed: false,
    });

    graph = addEdge(graph, {
      id: 'bc',
      source: 'b',
      target: 'c',
      type: 'related_to',
      directed: false,
    });

    expect(shortestPath(graph, 'a', 'c')).toEqual(['a', 'b', 'c']);
    expect([...kHopNodeIds(graph, ['a'], 1)].sort()).toEqual(['a', 'b']);
  });

  test('merges duplicate nodes and rewires edges', () => {
    let graph = createEmptyBrainGraph(
      'test',
      '2026-01-01T00:00:00.000Z',
    );

    for (const id of ['canonical', 'duplicate', 'other']) {
      graph = addNode(graph, concept(id));
    }

    graph = addEdge(graph, {
      id: 'duplicate-other',
      source: 'duplicate',
      target: 'other',
      type: 'related_to',
      directed: false,
    });

    const merged = mergeNodes(
      graph,
      'canonical',
      ['duplicate'],
    );

    expect(
      merged.nodes.some((node) => node.id === 'duplicate'),
    ).toBe(false);

    expect(
      merged.edges.some(
        (edge) =>
          edge.source === 'canonical' || edge.target === 'canonical',
      ),
    ).toBe(true);
  });
});
