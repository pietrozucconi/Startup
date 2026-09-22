import { describe, expect, test } from 'vitest';

import { AnthropicMessagesModelAdapter } from '@/lib/control-plane/anthropic-messages-adapter';
import type { AgentToolInvoker } from '@/lib/control-plane/agent-tool-runtime';
import { EnvironmentRuntimeSecretSource } from '@/lib/control-plane/runtime-secret-source';
import { getCompanyAgentRuntimeProfile } from '@/lib/control-plane/agent-runtime-profile';

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Anthropic Messages model adapter', () => {
  test('runs a client-tool loop and returns governed structured output', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    let turn = 0;

    const fetchImpl: typeof fetch = async (url, init) => {
      requests.push({ url: String(url), init });
      turn += 1;

      if (turn === 1) {
        return jsonResponse({
          id: 'msg-1',
          model: 'claude-sonnet-5',
          stop_reason: 'tool_use',
          usage: { input_tokens: 100, output_tokens: 20 },
          content: [{
            type: 'tool_use',
            id: 'tool-1',
            name: 'tavily-web-search',
            input: { query: 'ABC latest filing' },
          }],
        });
      }

      return jsonResponse({
        id: 'msg-2',
        model: 'claude-sonnet-5',
        stop_reason: 'tool_use',
        usage: { input_tokens: 120, output_tokens: 30 },
        content: [{
          type: 'tool_use',
          id: 'final-1',
          name: 'submit_company_output',
          input: {
            summary: 'Research completed.',
            operations: [{
              type: 'register_artifact',
              artifactKind: 'research_proposal',
              summary: 'ABC proposal.',
              metadata: { confidence: 0.7 },
            }],
          },
        }],
      });
    };

    const toolCalls: string[] = [];
    const tools: AgentToolInvoker = {
      listAvailableTools() {
        return [
          {
            id:
              'web-search',

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
        ];
      },
      async invoke(toolId) {
        toolCalls.push(toolId);
        return {
          summary: 'Found filing.',
          data: { result: true },
          provenance: [],
          metadata: {},
        };
      },
    };

    const adapter = new AnthropicMessagesModelAdapter({
      secretSource: new EnvironmentRuntimeSecretSource({
        ANTHROPIC_API_KEY: 'secret-test-key',
      }),
      fetchImpl,
      model: 'claude-sonnet-5',
    });

    const result = await adapter.execute({
      execution: {
        executionId: 'exec-1',
        profile: getCompanyAgentRuntimeProfile('lauti'),
        task: {
          taskId: 'task-1',
          handoffId: 'handoff-1',
          agentId: 'lauti',
          action: 'continue_research',
          summary: 'Research ABC.',
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
        workflow: null,
        brain: {
          route: null,
          results: [],
          truncated: false,
          totalContentChars: 0,
        },
        availableTools: tools.listAvailableTools(),
        idempotencyKey: 'exec-1',
        constraints: {
          maxToolCalls: 5,
          maxInputTokens: 10000,
          maxOutputTokens: 2000,
          maxOutputChars: 20000,
          timeoutMs: 30000,
          hiddenChainOfThoughtMustNotBePersisted: true,
          financialExecutionToolsAvailable: false,
          workflowMutationOnlyThroughControlPlane: true,
        },
      },
      tools,
      signal: new AbortController().signal,
    });

    expect(toolCalls).toEqual(['tavily-web-search']);
    expect(result.output.summary).toBe('Research completed.');
    expect(result.usage).toMatchObject({
      inputTokens: 220,
      outputTokens: 50,
    });
    expect(requests).toHaveLength(2);

    const firstHeaders = new Headers(requests[0].init?.headers);
    expect(firstHeaders.get('x-api-key')).toBe('secret-test-key');
  });
});
