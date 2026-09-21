import {
  describe,
  expect,
  test,
} from 'vitest';

import {
  inspectBrainGraph,
} from '@/lib/brain/brain-health';

import {
  addEdge,
  addNode,
  createEmptyBrainGraph,
} from '@/lib/brain/graph-ops';

import {
  decayedRetention,
  transitionMemoryStage,
} from '@/lib/brain/memory-dynamics';

import {
  buildWorkingMemoryFrame,
  retrieveBrainGraph,
  spreadActivation,
} from '@/lib/brain/retrieval';

function memoryNode(
  id: string,
  label: string,
  summary: string,
) {
  return {
    id,
    type: 'experience' as const,
    label,
    summary,
    context: {},
    epistemic: {
      kind: 'interpretation' as const,
      confidence: 0.8,
      verification: 'partially_verified' as const,
      temporal: {},
    },
    memory: {
      system: 'episodic' as const,
      stage: 'raw_experience' as const,
      salience: {
        novelty: 0.5,
        surprise: 0.5,
        materiality: 0.8,
        urgency: 0.2,
        riskImpact: 0.5,
        expectedUtility: 0.8,
      },
      activation: 0,
      retentionStrength: 1,
      consolidationScore: 0,
      accessCount: 0,
      rehearsalCount: 0,
      lastReinforcedAt: '2026-01-01T00:00:00.000Z',
      decayHalfLifeHours: 24,
      retentionLock: false,
      pendingReview: false,
    },
    audit: {
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  };
}

describe('Startup Brain retrieval and memory dynamics', () => {
  test('retrieves relevant memory with explainable scoring', () => {
    let graph = createEmptyBrainGraph(
      'test',
      '2026-01-01T00:00:00.000Z',
    );

    graph = addNode(
      graph,
      memoryNode(
        'rates',
        'Rates shock',
        'Higher rates compressed equity valuations.',
      ),
    );

    graph = addNode(
      graph,
      memoryNode(
        'crypto',
        'Crypto liquidity',
        'Digital asset liquidity weakened.',
      ),
    );

    const results = retrieveBrainGraph(
      graph,
      {
        text: 'rates equity valuations',
        limit: 10,
      },
      {
        now: '2026-01-01T01:00:00.000Z',
      },
    );

    expect(results[0]?.node.id).toBe('rates');
    expect(results[0]?.reasons).toContain('text_match');
  });

  test('spreads activation through semantic connections', () => {
    let graph = createEmptyBrainGraph(
      'test',
      '2026-01-01T00:00:00.000Z',
    );

    graph = addNode(graph, memoryNode('a', 'A', 'Alpha'));
    graph = addNode(graph, memoryNode('b', 'B', 'Beta'));

    graph = addEdge(graph, {
      id: 'ab',
      source: 'a',
      target: 'b',
      type: 'related_to',
      directed: false,
      strength: 1,
      confidence: 1,
    });

    const activation = spreadActivation(graph, ['a'], 2, 0.5);

    expect(activation.get('a')).toBe(1);
    expect(activation.get('b')).toBe(0.5);
  });

  test('models memory decay without destructive deletion', () => {
    const parsedGraph = addNode(
      createEmptyBrainGraph(
        'test',
        '2026-01-01T00:00:00.000Z',
      ),
      memoryNode('memory', 'Memory', 'Test memory'),
    );

    const node = parsedGraph.nodes[0]!;

    expect(
      decayedRetention(
        node,
        '2026-01-02T00:00:00.000Z',
      ),
    ).toBeCloseTo(0.5, 5);
  });

  test('enforces staged memory consolidation', () => {
    const graph = addNode(
      createEmptyBrainGraph(
        'test',
        '2026-01-01T00:00:00.000Z',
      ),
      memoryNode('memory', 'Memory', 'Test memory'),
    );

    const raw = graph.nodes[0]!;

    expect(() =>
      transitionMemoryStage(raw, 'validated_lesson'),
    ).toThrow();

    const interpreted = transitionMemoryStage(
      raw,
      'interpreted_experience',
    );

    const candidate = transitionMemoryStage(
      interpreted,
      'lesson_candidate',
    );

    const validated = transitionMemoryStage(
      candidate,
      'validated_lesson',
    );

    expect(validated.memory?.stage).toBe('validated_lesson');
  });

  test('builds bounded working memory from retrieval results', () => {
    let graph = createEmptyBrainGraph(
      'test',
      '2026-01-01T00:00:00.000Z',
    );

    graph = addNode(graph, memoryNode('a', 'A', 'rates'));
    graph = addNode(graph, memoryNode('b', 'B', 'rates'));

    const results = retrieveBrainGraph(
      graph,
      { text: 'rates', limit: 10 },
      { now: '2026-01-01T01:00:00.000Z' },
    );

    const frame = buildWorkingMemoryFrame(results, {
      id: 'wm-1',
      purpose: 'test',
      capacity: 1,
      createdAt: '2026-01-01T01:00:00.000Z',
    });

    expect(frame.focusNodeIds).toHaveLength(1);
  });

  test('produces a metacognitive health report', () => {
    const graph = addNode(
      createEmptyBrainGraph(
        'test',
        '2026-01-01T00:00:00.000Z',
      ),
      memoryNode(
        'orphan',
        'Orphan memory',
        'Unconnected operational memory.',
      ),
    );

    const report = inspectBrainGraph(
      graph,
      '2026-01-01T01:00:00.000Z',
    );

    expect(report.orphanNodeIds).toContain('orphan');
    expect(report.operationalNodesWithoutContext).toContain('orphan');
  });
});
