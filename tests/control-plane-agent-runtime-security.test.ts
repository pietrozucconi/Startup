import {
  describe,
  expect,
  test,
} from 'vitest';

import {
  AgentReadToolRegistry,
  GovernedAgentToolRuntime,
} from '@/lib/control-plane/agent-tool-runtime';

import {
  getCompanyAgentRuntimeProfile,
  listCompanyAgentRuntimeProfiles,
} from '@/lib/control-plane/agent-runtime-profile';

describe('V2H runtime security boundaries', () => {
  test('all 19 agents retain governed web research access and no execution capability exists', () => {
    const profiles =
      listCompanyAgentRuntimeProfiles();

    expect(profiles).toHaveLength(19);

    for (const profile of profiles) {
      expect(
        profile
          .allowedToolCapabilities,
      ).toContain(
        'web-research',
      );

      expect(
        profile
          .allowedToolCapabilities
          .some(
            (capability) =>
              capability.includes(
                'execution',
              ) ||
              capability.includes(
                'broker',
              ) ||
              capability.includes(
                'order',
              ),
          ),
      ).toBe(false);
    }
  });

  test('an agent cannot invoke a registered tool outside its trusted profile allowlist', async () => {
    const registry =
      new AgentReadToolRegistry();

    registry.register({
      id:
        'portfolio-reader',
      capability:
        'portfolio-data',
      description:
        'Read portfolio state.',
      async invoke() {
        return {
          summary:
            'Portfolio read.',
        };
      },
    });

    const profile =
      getCompanyAgentRuntimeProfile(
        'lauti',
      );

    const runtime =
      new GovernedAgentToolRuntime(
        profile,
        {
          taskId: 'task-1',
          handoffId:
            'handoff-1',
          agentId: 'lauti',
          action: 'research',
          summary: 'Research.',
          priority: 'normal',
          status: 'running',
          attempts: 1,
          createdAt:
            '2026-01-01T00:00:00.000Z',
          availableAt:
            '2026-01-01T00:00:00.000Z',
          updatedAt:
            '2026-01-01T00:00:00.000Z',
          retryPolicy: {
            maxAttempts: 3,
            initialDelayMs: 1_000,
            backoffMultiplier: 2,
            maxDelayMs: 10_000,
            timeoutMs: 30_000,
          },
          policyEvidence: [],
          payload: {},
          result: {},
        },
        registry,
        new AbortController()
          .signal,
      );

    await expect(
      runtime.invoke(
        'portfolio-reader',
      ),
    ).rejects.toThrow(
      'agent_tool_capability_denied:lauti:portfolio-data',
    );
  });

  test('tool-call budget is enforced by infrastructure rather than the model', async () => {
    const registry =
      new AgentReadToolRegistry();

    registry.register({
      id: 'web-reader',
      capability:
        'web-research',
      description:
        'Read public web information.',
      async invoke() {
        return {
          summary:
            'Web result.',
        };
      },
    });

    const base =
      getCompanyAgentRuntimeProfile(
        'lauti',
      );

    const profile = {
      ...base,
      budget: {
        ...base.budget,
        maxToolCalls: 1,
      },
    };

    const runtime =
      new GovernedAgentToolRuntime(
        profile,
        {
          taskId: 'task-2',
          handoffId:
            'handoff-2',
          agentId: 'lauti',
          action: 'research',
          summary: 'Research.',
          priority: 'normal',
          status: 'running',
          attempts: 1,
          createdAt:
            '2026-01-01T00:00:00.000Z',
          availableAt:
            '2026-01-01T00:00:00.000Z',
          updatedAt:
            '2026-01-01T00:00:00.000Z',
          retryPolicy: {
            maxAttempts: 3,
            initialDelayMs: 1_000,
            backoffMultiplier: 2,
            maxDelayMs: 10_000,
            timeoutMs: 30_000,
          },
          policyEvidence: [],
          payload: {},
          result: {},
        },
        registry,
        new AbortController()
          .signal,
      );

    await runtime.invoke(
      'web-reader',
    );

    await expect(
      runtime.invoke(
        'web-reader',
      ),
    ).rejects.toThrow(
      'agent_tool_call_budget_exhausted:lauti',
    );
  });
});
