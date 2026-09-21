import { describe, expect, test } from 'vitest';
import {
  AgentSchema,
  DepartmentSchema,
  ToolSchema,
} from '@/lib/schemas';

describe('AgentSchema', () => {
  const valid = {
    id: 'djed',
    departmentId: 'dept-research',
    name: 'Djed',
    role: 'Macro & Geopolitical Desk',
    status: 'planned',
    tier: 'specialist',
    description: 'Maintains the global macroeconomic and geopolitical view.',
    model: 'unassigned',
    tools: ['startup-brain', 'web-research', 'macro-data', 'market-data', 'news'],
    parentId: 'beppe',
    instance: 'builtin',
  };

  test('accepts a valid agent', () => {
    expect(AgentSchema.parse(valid)).toEqual(valid);
  });

  test('rejects an unknown status', () => {
    expect(() => AgentSchema.parse({ ...valid, status: 'sleeping' })).toThrow();
  });

  test('rejects an unknown tier', () => {
    expect(() => AgentSchema.parse({ ...valid, tier: 'intern' })).toThrow();
  });

  test('rejects a missing departmentId', () => {
    const { departmentId: _omitted, ...rest } = valid;
    expect(() => AgentSchema.parse(rest)).toThrow();
  });
});

describe('DepartmentSchema', () => {
  test('accepts a valid department', () => {
    const dept = {
      id: 'dept-marketing',
      name: 'Marketing & Growth',
      slug: 'marketing',
      tagline: 'Attention is the asset.',
      color: '#ec4899',
      order: 3,
    };
    expect(DepartmentSchema.parse(dept)).toEqual(dept);
  });

  test('rejects a non-numeric order', () => {
    expect(() =>
      DepartmentSchema.parse({
        id: 'd',
        name: 'X',
        slug: 'x',
        tagline: '',
        color: '#fff',
        order: 'first',
      }),
    ).toThrow();
  });
});



describe('ToolSchema', () => {
  test('rejects an unknown integration status', () => {
    expect(() =>
      ToolSchema.parse({
        id: 'tool-market-data',
        name: 'Market Data',
        category: 'Research',
        status: 'maybe',
        color: '#22d3ee',
        description: '',
      }),
    ).toThrow();
  });
});


