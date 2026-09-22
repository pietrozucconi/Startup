import { describe, expect, test } from 'vitest';

import { buildFirstRealProviderBundle } from '@/lib/control-plane/first-real-provider-bundle';
import { getCompanyAgentRuntimeProfile } from '@/lib/control-plane/agent-runtime-profile';
import { GovernedAgentToolRuntime } from '@/lib/control-plane/agent-tool-runtime';

describe('first real provider bundle', () => {
  test('exposes only tools allowed by the current employee profile', () => {
    const bundle = buildFirstRealProviderBundle({
      env: {
        ANTHROPIC_API_KEY: 'a',
        TAVILY_API_KEY: 'b',
        ALPHA_VANTAGE_API_KEY: 'c',
      },
      fetchImpl: async () => new Response('{}', { status: 200 }),
    });

    const runtime = new GovernedAgentToolRuntime(
      getCompanyAgentRuntimeProfile('lauti'),
      {
        taskId: 'task-1',
        handoffId: 'handoff-1',
        agentId: 'lauti',
        action: 'research',
        summary: 'Research.',
        priority: 'normal',
        status: 'running',
        attempts: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        availableAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        retryPolicy: {
          maxAttempts: 3,
          initialDelayMs: 1000,
          backoffMultiplier: 2,
          maxDelayMs: 10000,
          timeoutMs: 30000,
        },
        policyEvidence: [],
        payload: {},
        result: {},
      },
      bundle.toolRegistry,
      new AbortController().signal,
      undefined,
      bundle.credentialVault,
    );

    expect(runtime.listAvailableTools().map((t) => t.id)).toEqual([
      'alpha-vantage-market',
      'tavily-web-search',
    ]);
  });
});
