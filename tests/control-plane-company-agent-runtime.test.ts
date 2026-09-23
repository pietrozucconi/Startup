import {
  afterEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest';


describe(
  'company agent runtime',
  () => {
    afterEach(() => {
      vi.unstubAllGlobals();
      vi.resetModules();
    });


    test(
      'runs a non-Lauti agent with the model persisted in the company DB',
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
                  'chatcmpl-company-runtime-test',

                object:
                  'chat.completion',

                model:
                  'test/pepo-model',

                choices: [
                  {
                    index: 0,

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
                                  'Pepo runtime test completed.',

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
                status: 200,

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
          runCompanyAgentOnce,
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
            'groq/test/pepo-model',
        });


        const store =
          getControlPlaneRuntimeStore();


        const now =
          new Date()
            .toISOString();


        store.upsertAgentRuntimeTask({
          taskId:
            'test-company-runtime-pepo',

          handoffId:
            'test-company-runtime-pepo-handoff',

          agentId:
            'pepo',

          action:
            'test_runtime',

          summary:
            'Verify generic company runtime.',

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


        const result =
          await runCompanyAgentOnce(
            'pepo',
          );


        expect(
          result,
        ).toEqual({
          claimed:
            1,

          completed:
            1,

          failed:
            0,
        });


        expect(
          requestedModels,
        ).toEqual([
          'groq/test/pepo-model',
        ]);
      },
    );
  },
);