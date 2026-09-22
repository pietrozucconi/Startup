import {
  describe,
  expect,
  test,
} from 'vitest';

import {
  AnthropicMessagesModelAdapter,
} from '@/lib/control-plane/anthropic-messages-adapter';

import {
  EnvironmentRuntimeSecretSource,
} from '@/lib/control-plane/runtime-secret-source';

import {
  getCompanyAgentRuntimeProfile,
} from '@/lib/control-plane/agent-runtime-profile';

describe(
  'V2J.2 Anthropic live request shape',
  () => {
    test(
      'disables hidden thinking, nests parallel-tool control correctly and forwards tool input schemas',
      async () => {
        const captured: {
          body?: Record<string, any>;
        } = {};
        const fakeFetch:
          typeof fetch =
          async (
            _input,
            init,
          ) => {
            captured.body =
              JSON.parse(
                String(
                  init?.body ??
                  '{}',
                ),
              ) as Record<
                string,
                any
              >;

            return new Response(
              JSON.stringify({
                id:
                  'msg-test-1',
                model:
                  'claude-sonnet-5',
                stop_reason:
                  'tool_use',
                content: [
                  {
                    type:
                      'tool_use',
                    id:
                      'toolu-final',
                    name:
                      'submit_company_output',
                    input: {
                      summary:
                        'Sandbox output.',
                      operations:
                        [],
                    },
                  },
                ],
                usage: {
                  input_tokens:
                    100,
                  output_tokens:
                    20,
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
          };

        const adapter =
          new AnthropicMessagesModelAdapter({
            secretSource:
              new EnvironmentRuntimeSecretSource({
                ANTHROPIC_API_KEY:
                  'test-secret',
              }),

            fetchImpl:
              fakeFetch,

            model:
              'claude-sonnet-5',
          });

        const result =
          await adapter.execute({
            execution: {
              executionId:
                'execution-1',

              profile:
                getCompanyAgentRuntimeProfile(
                  'lauti',
                ),

              task: {
                taskId:
                  'task-1',
                handoffId:
                  'handoff-1',
                agentId:
                  'lauti',
                action:
                  'research',
                summary:
                  'Research AAPL.',
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

              availableTools: [
                {
                  id:
                    'tavily-web-search',
                  capability:
                    'web-research',
                  description:
                    'Search the web.',
                  effect:
                    'read',
                  inputSchema: {
                    type:
                      'object',
                    properties: {
                      query: {
                        type:
                          'string',
                      },
                    },
                    required: [
                      'query',
                    ],
                  },
                },
              ],

              idempotencyKey:
                'execution-1',

              constraints: {
                maxToolCalls:
                  5,
                maxInputTokens:
                  32_000,
                maxOutputTokens:
                  2_000,
                maxOutputChars:
                  20_000,
                timeoutMs:
                  30_000,
                hiddenChainOfThoughtMustNotBePersisted:
                  true,
                financialExecutionToolsAvailable:
                  false,
                workflowMutationOnlyThroughControlPlane:
                  true,
              },
            },

            tools: {
              listAvailableTools() {
                return [];
              },

              async invoke() {
                throw new Error(
                  'tool_should_not_run',
                );
              },
            },

            signal:
              new AbortController()
                .signal,
          });

        expect(
          captured.body?.thinking,
        ).toEqual({
          type:
            'disabled',
        });

        expect(
          captured.body?.output_config,
        ).toEqual({
          effort:
            'medium',
        });

        expect(
          captured.body?.tool_choice,
        ).toEqual({
          type:
            'auto',
          disable_parallel_tool_use:
            true,
        });

        expect(
          captured.body
            ?.disable_parallel_tool_use,
        ).toBeUndefined();

        expect(
          captured.body?.tools?.[0]
            ?.input_schema
            ?.properties
            ?.query
            ?.type,
        ).toBe(
          'string',
        );

        expect(
          result.output.summary,
        ).toBe(
          'Sandbox output.',
        );
      },
    );
  },
);
