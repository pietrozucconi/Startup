import {
  afterEach,
  describe,
  expect,
  test,
} from 'vitest';

import {
  buildFoundationBrainGraph,
  STARTUP_BRAIN_NODE_ID,
} from '@/lib/brain/graph-foundation';

import {
  BrainGraphSchema,
} from '@/lib/brain/graph-schema';

import {
  openDb,
  type FounderDb,
} from '@/lib/db';

import {
  seedDatabase,
} from '@/lib/seed';

let db: FounderDb;

afterEach(() => {
  db?.close();
});

describe('Startup Brain foundation graph', () => {
  test('contains the brain, 3 departments and 19 agents', () => {
    db = openDb(':memory:');
    seedDatabase(db);

    const graph = buildFoundationBrainGraph(
      db.departments.all(),
      db.agents.all(),
      '2026-01-01T00:00:00.000Z',
    );

    expect(graph.nodes).toHaveLength(23);
    expect(graph.edges).toHaveLength(38);

    expect(
      graph.nodes.find(
        (node) => node.id === STARTUP_BRAIN_NODE_ID,
      ),
    ).toMatchObject({
      type: 'brain',
      label: 'Startup Brain',
    });

    expect(
      graph.nodes.filter((node) => node.type === 'department'),
    ).toHaveLength(3);

    expect(
      graph.nodes.filter((node) => node.type === 'agent'),
    ).toHaveLength(19);
  });

  test('contains structural information only', () => {
    db = openDb(':memory:');
    seedDatabase(db);

    const graph = buildFoundationBrainGraph(
      db.departments.all(),
      db.agents.all(),
      '2026-01-01T00:00:00.000Z',
    );

    const allowed = new Set(['brain', 'department', 'agent']);

    expect(
      graph.nodes.every((node) => allowed.has(node.type)),
    ).toBe(true);

    expect(graph.metadata.operationalMemoryIncluded).toBe(false);
  });

  test('every agent belongs to its department', () => {
    db = openDb(':memory:');
    seedDatabase(db);

    const graph = buildFoundationBrainGraph(
      db.departments.all(),
      db.agents.all(),
      '2026-01-01T00:00:00.000Z',
    );

    for (const agent of db.agents.all()) {
      expect(
        graph.edges.some(
          (edge) =>
            edge.type === 'belongs_to' &&
            edge.source === agent.id &&
            edge.target === agent.departmentId,
        ),
      ).toBe(true);
    }
  });

  test('full snapshot passes graph invariants', () => {
    db = openDb(':memory:');
    seedDatabase(db);

    const graph = buildFoundationBrainGraph(
      db.departments.all(),
      db.agents.all(),
      '2026-01-01T00:00:00.000Z',
    );

    expect(() => BrainGraphSchema.parse(graph)).not.toThrow();
  });

  test('rejects dangling edges', () => {
    const result = BrainGraphSchema.safeParse({
      schemaVersion: 1,
      graphId: 'x',
      revision: 0,
      generatedAt: '2026-01-01T00:00:00.000Z',
      nodes: [
        {
          id: 'a',
          type: 'concept',
          label: 'A',
        },
      ],
      edges: [
        {
          id: 'e1',
          source: 'a',
          target: 'missing',
          type: 'related_to',
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});
