import { describe, expect, test } from 'vitest';
import { splitMetrics, type MetricInput } from '@/lib/operating-metrics';

const inputs: MetricInput[] = [
  { id: 'research-signals', label: 'Research Signals', unit: 'signals', source: 'Research', value: 42, delta: 3.6, deltaPct: true },
  { id: 'pipeline', label: 'Open Pipeline', unit: 'deals', source: 'Market Data', value: 14, delta: 2 },
  { id: 'agent-runs', label: 'Agent Runs', unit: 'runs', source: 'all time', value: 7, delta: 7 },
  { id: 'brain', label: 'Startup Brain Records', unit: 'records', source: 'Startup Brain', value: 1240 },
  { id: 'market-data', label: 'Market Data', unit: 'feeds', source: 'Data Provider', value: null },
  { id: 'unread', label: 'Unread (all inboxes)', unit: 'emails', source: 'pending creds', value: null },
  { id: 'portfolio-data', label: 'Portfolio Data', unit: 'feeds', source: 'pending connection', value: 0 },
];

describe('splitMetrics', () => {
  test('a metric is live only when it carries a real positive value', () => {
    const { live, pending } = splitMetrics(inputs);
    expect(live.map((m) => m.id)).toEqual(['research-signals', 'pipeline', 'agent-runs', 'brain']);
    expect(pending.map((m) => m.id)).toEqual(['market-data', 'unread', 'portfolio-data']);
  });

  test('null / zero / negative values are treated as pending, never faked', () => {
    const { pending } = splitMetrics(inputs);
    expect(pending.find((m) => m.id === 'market-data')?.value).toBe(0); // null normalised to 0
    expect(pending.find((m) => m.id === 'portfolio-data')?.value).toBe(0);
  });

  test('normalises missing delta/deltaPct to flat defaults', () => {
    const { live } = splitMetrics(inputs);
    const brain = live.find((m) => m.id === 'brain')!;
    expect(brain.delta).toBe(0);
    expect(brain.deltaPct).toBe(false);
    const signals = live.find((m) => m.id === 'research-signals')!;
    expect(signals.delta).toBe(3.6);
    expect(signals.deltaPct).toBe(true);
  });

  test('preserves input order within each bucket', () => {
    const { live } = splitMetrics(inputs);
    expect(live[0].id).toBe('research-signals');
    expect(live[live.length - 1].id).toBe('brain');
  });
});
