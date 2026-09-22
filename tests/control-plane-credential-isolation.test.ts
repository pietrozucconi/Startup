import {
  describe,
  expect,
  test,
} from 'vitest';

import {
  InMemoryAgentCredentialVault,
} from '@/lib/control-plane/credential-vault';

import {
  AgentReadToolRegistry,
  GovernedAgentToolRuntime,
} from '@/lib/control-plane/agent-tool-runtime';

import {
  getCompanyAgentRuntimeProfile,
} from '@/lib/control-plane/agent-runtime-profile';

describe(
  'V2I.2A credential isolation',
  () => {
    test(
      'model-visible descriptor contains no credential handle or secret while trusted adapter receives a scoped lease',
      async () => {
        const secret =
          'super-secret-api-key';

        const vault =
          new InMemoryAgentCredentialVault();

        vault.register({
          handle:
            'cred:filings-primary',

          provider:
            'filing-provider',

          values: {
            apiKey:
              secret,
          },

          allowedAgentIds: [
            'lauti',
          ],

          allowedCapabilities: [
            'company-filings',
          ],
        });

        let adapterSawSecret =
          false;

        const registry =
          new AgentReadToolRegistry();

        registry.register({
          id:
            'filing-reader',

          capability:
            'company-filings',

          description:
            'Read company filings.',

          credentialHandle:
            'cred:filings-primary',

          async invoke({
            credentials,
          }) {
            expect(
              credentials
                ?.provider,
            ).toBe(
              'filing-provider',
            );

            adapterSawSecret =
              credentials
                ?.get(
                  'apiKey',
                ) ===
              secret;

            return {
              summary:
                'Filing retrieved.',

              data: {
                safe:
                  true,
              },
            };
          },
        });

        const runtime =
          new GovernedAgentToolRuntime(
            getCompanyAgentRuntimeProfile(
              'lauti',
            ),

            {
              taskId:
                'task-1',

              handoffId:
                'handoff-1',

              agentId:
                'lauti',

              action:
                'research',

              summary:
                'Research.',

              priority:
                'normal',

              status:
                'running',

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

            () =>
              '2026-01-01T00:00:01.000Z',

            vault,
          );

        const descriptor =
          runtime
            .listAvailableTools()
            .find(
              (tool) =>
                tool.id ===
                'filing-reader',
            );

        expect(
          descriptor,
        ).toEqual({
          id:
            'filing-reader',

          capability:
            'company-filings',

          description:
            'Read company filings.',

          effect:
            'read',

          inputSchema: {
            type:
              'object',

            additionalProperties:
              true,
          },
        });

        expect(
          JSON.stringify(
            descriptor,
          ),
        ).not.toContain(
          'cred:filings-primary',
        );

        expect(
          JSON.stringify(
            descriptor,
          ),
        ).not.toContain(
          secret,
        );

        await runtime.invoke(
          'filing-reader',
        );

        expect(
          adapterSawSecret,
        ).toBe(true);

        expect(
          JSON.stringify(
            runtime.getTraces(),
          ),
        ).not.toContain(
          secret,
        );

        expect(
          JSON.stringify(
            runtime.getTraces(),
          ),
        ).not.toContain(
          'cred:filings-primary',
        );
      },
    );

    test(
      'credential policy denies a different employee even if the tool exists',
      async () => {
        const vault =
          new InMemoryAgentCredentialVault();

        vault.register({
          handle:
            'cred:restricted',

          provider:
            'provider',

          values: {
            apiKey:
              'not-visible',
          },

          allowedAgentIds: [
            'pepo',
          ],

          allowedCapabilities: [
            'company-filings',
          ],
        });

        const registry =
          new AgentReadToolRegistry();

        registry.register({
          id:
            'restricted-filings',

          capability:
            'company-filings',

          description:
            'Restricted reader.',

          credentialHandle:
            'cred:restricted',

          async invoke() {
            return {
              summary:
                'Should not run.',
            };
          },
        });

        const runtime =
          new GovernedAgentToolRuntime(
            getCompanyAgentRuntimeProfile(
              'lauti',
            ),

            {
              taskId:
                'task-2',

              handoffId:
                'handoff-2',

              agentId:
                'lauti',

              action:
                'research',

              summary:
                'Research.',

              priority:
                'normal',

              status:
                'running',

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

            undefined,

            vault,
          );

        await expect(
          runtime.invoke(
            'restricted-filings',
          ),
        ).rejects.toThrow(
          'credential_agent_denied:lauti:cred:restricted',
        );
      },
    );
  },
);
