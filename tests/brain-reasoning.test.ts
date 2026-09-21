import {
  describe,
  expect,
  test,
} from 'vitest';

import {
  addEdge,
  addNode,
  createEmptyBrainGraph,
} from '@/lib/brain/graph-ops';

import {
  evidenceBalance,
  findKnowledgeGaps,
  findUnresolvedContradictions,
} from '@/lib/brain/reasoning';

import {
  findAnalogies,
  repeatedErrorPatterns,
} from '@/lib/brain/learning';

function node(
  id: string,
  type: 'evidence' | 'thesis' | 'question' | 'error' | 'experience',
  extra: Record<string, unknown> = {},
) {
  return {
    id,
    type,
    label: id,
    ...extra,
  };
}

describe('Startup Brain reasoning and learning', () => {
  test('balances supporting and contradicting evidence', () => {
    let graph = createEmptyBrainGraph(
      'test',
      '2026-01-01T00:00:00.000Z',
    );

    graph = addNode(graph, node('support', 'evidence', {
      epistemic: {
        kind: 'fact',
        confidence: 0.9,
        verification: 'verified',
        temporal: {},
      },
    }));

    graph = addNode(graph, node('counter', 'evidence', {
      epistemic: {
        kind: 'fact',
        confidence: 0.5,
        verification: 'verified',
        temporal: {},
      },
    }));

    graph = addNode(graph, node('thesis', 'thesis'));

    graph = addEdge(graph, {
      id: 's',
      source: 'support',
      target: 'thesis',
      type: 'supports',
      strength: 1,
      confidence: 1,
    });

    graph = addEdge(graph, {
      id: 'c',
      source: 'counter',
      target: 'thesis',
      type: 'contradicts',
      strength: 1,
      confidence: 1,
    });

    const balance = evidenceBalance(graph, 'thesis');

    expect(balance.supportScore).toBeGreaterThan(
      balance.contradictionScore,
    );
    expect(findUnresolvedContradictions(graph)).toHaveLength(1);
  });

  test('detects open questions and knowledge gaps', () => {
    let graph = createEmptyBrainGraph(
      'test',
      '2026-01-01T00:00:00.000Z',
    );

    graph = addNode(graph, node('q1', 'question'));

    const gaps = findKnowledgeGaps(graph);
    expect(gaps.openQuestionIds).toContain('q1');
  });

  test('finds cross-context analogies', () => {
    let graph = createEmptyBrainGraph(
      'test',
      '2026-01-01T00:00:00.000Z',
    );

    graph = addNode(graph, node('a', 'experience', {
      tags: ['liquidity-shock'],
      context: {
        marketRegimes: ['risk-off'],
        horizons: ['short'],
      },
      memory: {
        system: 'episodic',
        stage: 'raw_experience',
      },
    }));

    graph = addNode(graph, node('b', 'experience', {
      tags: ['liquidity-shock'],
      context: {
        marketRegimes: ['risk-off'],
        horizons: ['short'],
      },
      memory: {
        system: 'episodic',
        stage: 'raw_experience',
      },
    }));

    expect(findAnalogies(graph, 'a')[0]?.node.id).toBe('b');
  });

  test('groups repeated error patterns', () => {
    let graph = createEmptyBrainGraph(
      'test',
      '2026-01-01T00:00:00.000Z',
    );

    for (const id of ['e1', 'e2']) {
      graph = addNode(graph, node(id, 'error', {
        errorClass: 'FORECAST_ERROR',
        context: {
          marketRegimes: ['risk-off'],
          horizons: ['short'],
        },
      }));
    }

    expect(repeatedErrorPatterns(graph)).toHaveLength(1);
  });
});
