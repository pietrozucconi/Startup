import {
  describe,
  expect,
  test,
} from 'vitest';

import {
  AssignedOmniRouteModelAdapter,
} from '@/lib/control-plane/assigned-model-adapter';

import {
  getCompanyAgentRuntimeProfile,
} from '@/lib/control-plane/agent-runtime-profile';

import {
  EnvironmentRuntimeSecretSource,
} from '@/lib/control-plane/runtime-secret-source';

import type {
  AgentToolInvoker,
} from '@/lib/control-plane/agent-tool-runtime';


describe(
  'Assigned OmniRoute model adapter',
  () => {
    test(
      'pins the manually assigned model for the whole execution',
      async () => {
        let assignedModel =
          'groq/openai/gpt-oss-120b';

        let resolverCalls =
          0;

        const requestedModels:
          string[] =
          [];


        const fetchImpl:
          typeof fetch =
          async (
            _url,
            init,
          ) => {
            const body =
              JSON.parse(
                String(
                  init?.body,
                ),
              ) as {
                model:
                  string;
              };


            requestedModels.push(
              body.model,
            );


            /*
             * Simulate the CEO changing Lauti's assignment
             * while this task is already running.
             */
            assignedModel =
              'groq/qwen/qwen3-32b';


            return new Response(
              JSON.stringify({
                id:
                  'chatcmpl-pin-test',

                object:
                  'chat.completion',

                model:
                  'openai/gpt-oss-120b',

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
                                  'Pinned model test completed.',

                                operations:
                                  [],

                                metadata: {
                                  test:
                                    true,
                                },
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
          };


        const secretSource =
          new EnvironmentRuntimeSecretSource({
            OMNIROUTE_API_KEY:
              'test-key',
          });


        const adapter =
          new AssignedOmniRouteModelAdapter({
            resolveAssignedModel:
              () => {
                resolverCalls +=
                  1;

                return assignedModel;
              },

            secretSource,

            baseUrl:
              'http://localhost:20128/v1',

            fetchImpl,

            clock:
              () =>
                '2026-09-22T22:00:00.000Z',
          });


        const tools:
          AgentToolInvoker = {
          listAvailableTools:
            () =>
              [],

          invoke:
            async () => ({
              summary:
                '',

              provenance:
                [],

              metadata:
                {},
            }),
        };


        const profile =
          getCompanyAgentRuntimeProfile(
            'lauti',
          );


        const result =
          await adapter.execute({
            execution: {
              executionId:
                'execution-pin-test',

              profile,

              task: {
                taskId:
                  'task-pin-test',

                handoffId:
                  'handoff-pin-test',

                agentId:
                  'lauti',

                action:
                  'test_model_pin',

                summary:
                  'Verify that the assigned model is pinned.',

                priority:
                  'normal',

                status:
                  'running',

                attempts:
                  1,

                createdAt:
                  '2026-09-22T22:00:00.000Z',

                availableAt:
                  '2026-09-22T22:00:00.000Z',

                updatedAt:
                  '2026-09-22T22:00:00.000Z',

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
              },

              workflow:
                null,

              brain: {
                route:
                  null,

                results:
                  [],

                truncated:
                  false,

                totalContentChars:
                  0,
              },

              availableTools:
                [],

              idempotencyKey:
                'execution-pin-test',

              constraints: {
                maxToolCalls:
                  12,

                maxInputTokens:
                  32000,

                maxOutputTokens:
                  8000,

                maxOutputChars:
                  100000,

                timeoutMs:
                  120000,

                hiddenChainOfThoughtMustNotBePersisted:
                  true,

                financialExecutionToolsAvailable:
                  false,

                workflowMutationOnlyThroughControlPlane:
                  true,
              },
            },

            tools,

            signal:
              new AbortController()
                .signal,
          });


        /*
         * Assignment has changed externally...
         */
        expect(
          assignedModel,
        ).toBe(
          'groq/qwen/qwen3-32b',
        );


        /*
         * ...but this execution used the model that
         * was selected when execution began.
         */
        expect(
          requestedModels,
        ).toEqual([
          'groq/openai/gpt-oss-120b',
        ]);


        /*
         * Most important: the resolver was read once.
         */
        expect(
          resolverCalls,
        ).toBe(
          1,
        );


        expect(
          result.metadata,
        ).toMatchObject({
          modelAssignment: {
            mode:
              'manual',

            agentId:
              'lauti',

            pinnedModel:
              'groq/openai/gpt-oss-120b',

            pinnedAt:
              '2026-09-22T22:00:00.000Z',

            automaticFallback:
              false,
          },
        });
      },
    );


    test(
      'refuses execution when no model is assigned',
      async () => {
        const adapter =
          new AssignedOmniRouteModelAdapter({
            resolveAssignedModel:
              () =>
                'unassigned',

            secretSource:
              new EnvironmentRuntimeSecretSource({
                OMNIROUTE_API_KEY:
                  'test-key',
              }),
          });


        const profile =
          getCompanyAgentRuntimeProfile(
            'lauti',
          );


        const tools:
          AgentToolInvoker = {
          listAvailableTools:
            () =>
              [],

          invoke:
            async () => ({
              summary:
                '',

              provenance:
                [],

              metadata:
                {},
            }),
        };


        await expect(
          adapter.execute({
            execution: {
              executionId:
                'execution-no-model',

              profile,

              task: {
                taskId:
                  'task-no-model',

                handoffId:
                  'handoff-no-model',

                agentId:
                  'lauti',

                action:
                  'test_missing_model',

                summary:
                  'Missing model test.',

                priority:
                  'normal',

                status:
                  'running',

                attempts:
                  1,

                createdAt:
                  '2026-09-22T22:00:00.000Z',

                availableAt:
                  '2026-09-22T22:00:00.000Z',

                updatedAt:
                  '2026-09-22T22:00:00.000Z',

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
              },

              workflow:
                null,

              brain: {
                route:
                  null,

                results:
                  [],

                truncated:
                  false,

                totalContentChars:
                  0,
              },

              availableTools:
                [],

              idempotencyKey:
                'execution-no-model',

              constraints: {
                maxToolCalls:
                  12,

                maxInputTokens:
                  32000,

                maxOutputTokens:
                  8000,

                maxOutputChars:
                  100000,

                timeoutMs:
                  120000,

                hiddenChainOfThoughtMustNotBePersisted:
                  true,

                financialExecutionToolsAvailable:
                  false,

                workflowMutationOnlyThroughControlPlane:
                  true,
              },
            },

            tools,

            signal:
              new AbortController()
                .signal,
          }),
        ).rejects.toThrow(
          'agent_model_not_assigned:lauti',
        );
      },
    );
  },
);