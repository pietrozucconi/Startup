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
      captured.request?.query.departmentIds,
    ).toBeUndefined();

    expect(
      captured.request?.query.agentIds,
    ).toBeUndefined();

    expect(
      captured.request?.query.assetIds,
    ).toBeUndefined();

    expect(
      captured.request?.query.seedNodeIds,
    ).toEqual([
      'startup-brain',
      'dept-research',
      'lauti',
    ]);

    expect(
      captured.request?.context.assetIds,
    ).toEqual(['ABC']);
  });

  test('progressively expands Brain retrieval until no new nodes are found', async () => {
    const calls: Array<{
      maxHops?: number;
      limit?: number;
    }> = [];

    let callNumber =
      0;

    const provider =
      new BrainGatewayAgentContextProvider({
        async read(request) {
          callNumber +=
            1;

          calls.push({
            maxHops:
              request.query.maxHops,

            limit:
              request.query.limit,
          });

          const nodeIds =
            callNumber === 1
              ? ['memory-a']
              : [
                  'memory-a',
                  'memory-b',
                ];

          return {
            route: {
              intent:
                'institutional_memory',

              routes: [
                'brain',
              ],

              brainRequired:
                true,

              explanation:
                'test progressive retrieval',
            },

            results:
              nodeIds.map(
                (
                  id,
                ) => ({
                  node: {
                    id,
                  },

                  score:
                    1,

                  breakdown:
                    {},

                  reasons:
                    [],
                }),
              ),

            truncated:
              false,

            totalContentChars:
              0,
          } as any;
        },
      });

    const result =
      await provider.retrieve({
        profile:
          getCompanyAgentRuntimeProfile(
            'lauti',
          ),

        task: {
          taskId:
            'task-progressive',

          handoffId:
            'handoff-progressive',

          workflowId:
            'wf-progressive',

          agentId:
            'lauti',

          action:
            'continue_research',

          summary:
            'Research AAPL using relevant institutional memory.',

          priority:
            'normal',

          status:
            'running',

          attempts:
            1,

          createdAt:
            '2026-01-01T00:00:00.000Z',

          availableAt:
            '2026-01-01T00:00:00.000Z',

          updatedAt:
            '2026-01-01T00:00:00.000Z',

          retryPolicy: {
            maxAttempts:
              3,

            initialDelayMs:
              1_000,

            backoffMultiplier:
              2,

            maxDelayMs:
              10_000,

            timeoutMs:
              30_000,
          },

          policyEvidence:
            [],

          payload:
            {},

          result:
            {},
        },

        workflow: {
          id:
            'wf-progressive',

          state:
            'RESEARCHING',

          revision:
            0,

          createdBy: {
            kind:
              'agent',

            id:
              'lauti',
          },

          createdAt:
            '2026-01-01T00:00:00.000Z',

          updatedAt:
            '2026-01-01T00:00:00.000Z',

          responsibleResearchAgentId:
            'lauti',

          assetRef:
            'AAPL',

          artifacts:
            [],

          invalidations:
            [],

          metadata:
            {},
        },

        requestId:
          'brain-progressive-test',
      });

    expect(
      calls,
    ).toEqual([
      {
        maxHops:
          2,

        limit:
          12,
      },
      {
        maxHops:
          3,

        limit:
          12,
      },
      {
        maxHops:
          4,

        limit:
          12,
      },
    ]);

    expect(
      result.results.map(
        (
          item,
        ) =>
          item.node.id,
      ),
    ).toEqual([
      'memory-a',
      'memory-b',
    ]);

    expect(
      result.truncated,
    ).toBe(
      false,
    );
  });
});


