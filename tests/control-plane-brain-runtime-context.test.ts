import {
  describe,
  expect,
  test,
} from 'vitest';

import {
  BrainGatewayAgentContextProvider,
} from '@/lib/control-plane/brain-context-provider';

import {
  getCompanyAgentRuntimeProfile,
} from '@/lib/control-plane/agent-runtime-profile';

describe('V2H Startup Brain runtime context', () => {
  test('issues only agent read/retrieve capabilities through Brain Gateway', async () => {
    const captured: {
      request?: Record<string, any>;
    } = {};

    const provider =
      new BrainGatewayAgentContextProvider({
        async read(request) {
          captured.request =
            request as Record<
              string,
              any
            >;

          return {
            route: {
              intent:
                'institutional_memory',
              routes: ['brain'],
              brainRequired: true,
              explanation:
                'test route',
            },
            results: [],
            truncated: false,
            totalContentChars: 0,
          };
        },
      });

    await provider.retrieve({
      profile:
        getCompanyAgentRuntimeProfile(
          'lauti',
        ),
      task: {
        taskId: 'task-1',
        handoffId:
          'handoff-1',
        workflowId: 'wf-1',
        agentId: 'lauti',
        action:
          'continue_research',
        summary:
          'Research ABC.',
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
      workflow: {
        id: 'wf-1',
        state:
          'RESEARCHING',
        revision: 0,
        createdBy: {
          kind: 'agent',
          id: 'lauti',
        },
        createdAt:
          '2026-01-01T00:00:00.000Z',
        updatedAt:
          '2026-01-01T00:00:00.000Z',
        responsibleResearchAgentId:
          'lauti',
        assetRef: 'ABC',
        artifacts: [],
        invalidations: [],
        metadata: {},
      },
      requestId:
        'brain-read-1',
    });

    expect(
      captured.request?.principal,
    ).toMatchObject({
      actor: {
        kind: 'agent',
        id: 'lauti',
      },
      departmentIds: [
        'dept-research',
      ],
      capabilities: [
        'brain.read',
        'brain.retrieve',
      ],
      issuedBy:
        'company-control-plane',
    });

    expect(
      captured.request?.principal
        .capabilities,
    ).not.toContain(
      'brain.commit_write',
    );

    expect(
      captured.request?.query.assetIds,
    ).toEqual(['ABC']);
  });
});
