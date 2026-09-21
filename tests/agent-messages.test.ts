import { describe, expect, test } from 'vitest';
import { openDb } from '@/lib/db';

function db() {
  return openDb(':memory:');
}

describe('agentMessages repo', () => {
  test('insert + byAgent round-trips oldest→newest, scoped to the agent', () => {
    const d = db();
    d.agentMessages.insert({ id: 'm1', agentId: 'lauti', role: 'user', content: 'hi', toolCalls: [], createdAt: '2026-06-12T01:00:00Z' });
    d.agentMessages.insert({ id: 'm2', agentId: 'lauti', role: 'assistant', content: 'hello', toolCalls: [], createdAt: '2026-06-12T02:00:00Z' });
    d.agentMessages.insert({ id: 'm3', agentId: 'research-agent', role: 'user', content: 'other', toolCalls: [], createdAt: '2026-06-12T03:00:00Z' });
    const msgs = d.agentMessages.byAgent('lauti');
    expect(msgs.map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(msgs[1].role).toBe('assistant');
  });

  test('persists tool calls as structured data', () => {
    const d = db();
    d.agentMessages.insert({
      id: 'm1',
      agentId: 'lauti',
      role: 'tool',
      content: 'searched Startup Brain',
      toolCalls: [{ name: 'searchStartupBrain', args: { q: 'prior thesis' }, result: { hits: 2 } }],
      createdAt: '2026-06-12T01:00:00Z',
    });
    const [m] = d.agentMessages.byAgent('lauti');
    expect(m.toolCalls).toEqual([{ name: 'searchStartupBrain', args: { q: 'prior thesis' }, result: { hits: 2 } }]);
  });

  test('recent(limit) returns newest-first across agents', () => {
    const d = db();
    d.agentMessages.insert({ id: 'm1', agentId: 'a', role: 'user', content: '1', toolCalls: [], createdAt: '2026-06-12T01:00:00Z' });
    d.agentMessages.insert({ id: 'm2', agentId: 'b', role: 'user', content: '2', toolCalls: [], createdAt: '2026-06-12T02:00:00Z' });
    expect(d.agentMessages.recent(1).map((m) => m.id)).toEqual(['m2']);
  });

  test('rejects an invalid role at the boundary (Zod-validated on the way in)', () => {
    const d = db();
    expect(() =>
      d.agentMessages.insert({ id: 'm1', agentId: 'a', role: 'bogus' as never, content: 'x', toolCalls: [], createdAt: '2026-06-12T01:00:00Z' }),
    ).toThrow();
  });
});
