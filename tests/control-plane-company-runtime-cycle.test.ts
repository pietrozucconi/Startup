import {
  afterEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest';


describe(
  'company runtime cycle',
  () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.resetModules();

      delete process.env.STARTUP_DB;
      delete process.env.STARTUP_CONTROL_PLANE_DB;
      delete process.env.OMNIROUTE_API_KEY;
      delete process.env.OMNIROUTE_BASE_URL;
    });


    test(
      'runs only the agent that has a queued Control Plane task',
      async () => {
        process.env.STARTUP_DB =
          ':memory:';

        process.env.STARTUP_CONTROL_PLANE_DB =
          ':memory:';

        process.env.OMNIROUTE_API_KEY =
          'test-key';

        process.env.OMNIROUTE_BASE_URL =
          'http://localhost:20128/v1';


        const requestedModels:
          string[] = [];


        vi.stubGlobal(
          'fetch',
          async (
            _url: string | URL | Request,
            init?: RequestInit,
          ) => {
            const body =
              JSON.parse(
                String(
                  init?.body,
                ),
              ) as {
                model: string;
              };


            requestedModels.push(
              body.model,
            );


            return new Response(
              JSON.stringify({
                id:
                  'chatcmpl-runtime-cycle-test',

                object:
                  'chat.completion',

                model:
                  'test/pepo-cycle-model',

                choices: [
                  {
                    index:
                      0,

                    finish_reason:
                      'tool_calls',

                    message: {
                      role:
                        'assistant',

                      content:
                        null,

                      tool_calls: [
                        {
                          id:
                            'call-final',

                          type:
                            'function',

                          function: {
                            name:
                              'submit_company_output',

                            arguments:
                              JSON.stringify({
                                summary:
                                  'Pepo cycle test completed.',

                                operations:
                                  [],

                                metadata:
                                  {},
                              }),
                          },
                        },
                      ],
                    },
                  },
                ],

                usage: {
                  prompt_tokens:
                    100,

                  completion_tokens:
                    20,

                  total_tokens:
                    120,
                },
              }),
              {
                status:
                  200,

                headers: {
                  'content-type':
                    'application/json',
                },
              },
            );
          },
        );


        const {
          getDb,
        } =
          await import(
            '@/lib/data'
          );


        const {
          getControlPlaneRuntimeStore,
        } =
          await import(
            '@/lib/control-plane/runtime-data'
          );


        const {
          runCompanyRuntimeCycle,
        } =
          await import(
            '@/lib/control-plane/company-agent-runtime'
          );


        const db =
          getDb();


        const pepo =
          db.agents
            .all()
            .find(
              (
                agent,
              ) =>
                agent.id ===
                'pepo',
            );


        if (!pepo) {
          throw new Error(
            'test_pepo_not_found',
          );
        }


        db.agents.insert({
          ...pepo,

          model:
            'groq/test/pepo-cycle-model',
        });


        const store =
          getControlPlaneRuntimeStore();


        const now =
          new Date()
            .toISOString();


        store.upsertAgentRuntimeTask({
          taskId:
            'runtime-cycle-pepo-task',

          handoffId:
            'runtime-cycle-pepo-handoff',

          agentId:
            'pepo',

          action:
            'test_company_runtime_cycle',

          summary:
            'Only Pepo should execute during this cycle.',

          priority:
            'normal',

          status:
            'queued',

          attempts:
            0,

          createdAt:
            now,

          availableAt:
            now,

          updatedAt:
            now,

          retryPolicy: {
            maxAttempts:
              1,

            initialDelayMs:
              1000,

            backoffMultiplier:
              2,

            maxDelayMs:
              10000,

            timeoutMs:
              120000,
          },

          policyEvidence:
            [],

          payload:
            {},

          result:
            {},
        });


        const results =
          await runCompanyRuntimeCycle();


        expect(
          results,
        ).toHaveLength(
          19,
        );


        const pepoResult =
          results.find(
            (
              result,
            ) =>
              result.agentId ===
                'pepo',
          );


        expect(
          pepoResult,
        ).toEqual({
          agentId:
            'pepo',

          claimed:
            1,

          completed:
            1,

          failed:
            0,
        });


        const otherAgents =
          results.filter(
            (
              result,
            ) =>
              result.agentId !==
                'pepo',
          );


        expect(
          otherAgents,
        ).toHaveLength(
          18,
        );


        for (
          const result
          of otherAgents
        ) {
          expect(
            result.claimed,
          ).toBe(
            0,
          );

          expect(
            result.completed,
          ).toBe(
            0,
          );

          expect(
            result.failed,
          ).toBe(
            0,
          );
        }


        expect(
          requestedModels,
        ).toEqual([
          'groq/test/pepo-cycle-model',
        ]);
      },
    );
  },
);