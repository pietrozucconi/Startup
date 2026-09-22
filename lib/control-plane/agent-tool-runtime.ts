import { z } from 'zod';

import {
  ProvenanceRefSchema,
  TimestampSchema,
} from '@/lib/brain/core-schema';

import {
  AgentToolCapabilitySchema,
  type AgentToolCapability,
  type CompanyAgentRuntimeProfile,
} from '@/lib/control-plane/agent-runtime-profile';

import type {
  AgentCredentialVault,
  ToolCredentialLease,
} from '@/lib/control-plane/credential-vault';

import {
  AgentCredentialHandleSchema,
} from '@/lib/control-plane/credential-vault';

import type {
  AgentRuntimeTask,
} from '@/lib/control-plane/runtime-schema';

export const AgentToolResultSchema = z.object({
  summary: z.string().default(''),
  data: z.unknown().optional(),
  provenance: z
    .array(
      ProvenanceRefSchema,
    )
    .default([]),
  observedAt:
    TimestampSchema.optional(),
  metadata:
    z.record(
      z.unknown(),
    )
    .default({}),
});

export type AgentToolResult = z.infer<
  typeof AgentToolResultSchema
>;

export type AgentToolResultInput = z.input<
  typeof AgentToolResultSchema
>;

export type AgentReadToolContext = {
  agentId: string;
  taskId: string;
  workflowId?: string;
};

export interface AgentReadToolAdapter {
  id: string;

  capability:
    AgentToolCapability;

  description: string;

  /**
   * Opaque handle only. The model never sees this value.
   * Trusted infrastructure resolves it immediately before adapter execution.
   */
  credentialHandle?: string;

  invoke(input: {
    args:
      Record<
        string,
        unknown
      >;

    context:
      AgentReadToolContext;

    credentials?:
      ToolCredentialLease;

    signal:
      AbortSignal;
  }): Promise<
    AgentToolResultInput
  >;
}

export type AgentToolDescriptor = {
  id: string;
  capability:
    AgentToolCapability;
  description: string;
  effect: 'read';
};

export type AgentToolCallTrace = {
  sequence: number;
  toolId: string;
  capability:
    AgentToolCapability;
  startedAt: string;
  completedAt: string;
  success: boolean;
  provenanceCount: number;
  error?: string;
};

export interface AgentToolInvoker {
  listAvailableTools():
    AgentToolDescriptor[];

  invoke(
    toolId: string,
    args?:
      Record<
        string,
        unknown
      >,
  ): Promise<
    AgentToolResult
  >;
}

export class AgentReadToolRegistry {
  private readonly tools =
    new Map<
      string,
      AgentReadToolAdapter
    >();

  register(
    rawAdapter:
      AgentReadToolAdapter,
  ): void {
    if (
      !rawAdapter.id.trim()
    ) {
      throw new Error(
        'agent_tool_id_required',
      );
    }

    const capability =
      AgentToolCapabilitySchema.parse(
        rawAdapter.capability,
      );

    const credentialHandle =
      rawAdapter
        .credentialHandle ===
      undefined
        ? undefined
        : AgentCredentialHandleSchema.parse(
            rawAdapter
              .credentialHandle,
          );

    if (
      this.tools.has(
        rawAdapter.id,
      )
    ) {
      throw new Error(
        `agent_tool_already_registered:${rawAdapter.id}`,
      );
    }

    this.tools.set(
      rawAdapter.id,
      {
        ...rawAdapter,
        capability,
        credentialHandle,
      },
    );
  }

  get(
    toolId: string,
  ): AgentReadToolAdapter | null {
    return (
      this.tools.get(
        toolId,
      ) ??
      null
    );
  }

  listForCapabilities(
    capabilities:
      readonly AgentToolCapability[],
  ): AgentToolDescriptor[] {
    const allowed =
      new Set(
        capabilities,
      );

    return [
      ...this.tools.values(),
    ]
      .filter(
        (tool) =>
          allowed.has(
            tool.capability,
          ),
      )
      .map(
        (tool) => ({
          id:
            tool.id,
          capability:
            tool.capability,
          description:
            tool.description,
          effect:
            'read' as const,
        }),
      )
      .sort(
        (a, b) =>
          a.id.localeCompare(
            b.id,
          ),
      );
  }
}

function errorMessage(
  error: unknown,
): string {
  return error instanceof Error
    ? error.message
    : String(error);
}

/**
 * Per-execution read-tool broker.
 *
 * The model/framework never receives the registry or the credential vault.
 * Credential resolution happens only inside this trusted runtime immediately
 * before invoking the trusted tool adapter.
 */
export class GovernedAgentToolRuntime
  implements AgentToolInvoker
{
  private callCount = 0;

  private readonly traces:
    AgentToolCallTrace[] = [];

  private readonly provenance:
    z.infer<
      typeof ProvenanceRefSchema
    >[] = [];

  constructor(
    private readonly profile:
      CompanyAgentRuntimeProfile,

    private readonly task:
      AgentRuntimeTask,

    private readonly registry:
      AgentReadToolRegistry,

    private readonly signal:
      AbortSignal,

    private readonly clock:
      () => string = () =>
        new Date().toISOString(),

    private readonly credentialVault?:
      AgentCredentialVault,
  ) {}

  listAvailableTools():
    AgentToolDescriptor[] {
    return this.registry
      .listForCapabilities(
        this.profile
          .allowedToolCapabilities,
      );
  }

  async invoke(
    toolId: string,
    args:
      Record<
        string,
        unknown
      > = {},
  ): Promise<
    AgentToolResult
  > {
    if (
      this.signal.aborted
    ) {
      throw new Error(
        'agent_execution_cancelled',
      );
    }

    const adapter =
      this.registry.get(
        toolId,
      );

    if (!adapter) {
      throw new Error(
        `agent_tool_not_registered:${toolId}`,
      );
    }

    if (
      !this.profile
        .allowedToolCapabilities
        .includes(
          adapter.capability,
        )
    ) {
      throw new Error(
        `agent_tool_capability_denied:${this.profile.agentId}:${adapter.capability}`,
      );
    }

    if (
      this.callCount >=
      this.profile.budget
        .maxToolCalls
    ) {
      throw new Error(
        `agent_tool_call_budget_exhausted:${this.profile.agentId}`,
      );
    }

    this.callCount += 1;

    const sequence =
      this.callCount;

    const startedAt =
      this.clock();

    try {
      let credentials:
        | ToolCredentialLease
        | undefined;

      if (
        adapter
          .credentialHandle
      ) {
        if (
          !this.credentialVault
        ) {
          throw new Error(
            `credential_vault_required:${adapter.id}`,
          );
        }

        credentials =
          await this
            .credentialVault
            .resolve({
              handle:
                adapter
                  .credentialHandle,

              context: {
                agentId:
                  this.profile
                    .agentId,

                taskId:
                  this.task
                    .taskId,

                workflowId:
                  this.task
                    .workflowId,

                toolId:
                  adapter.id,

                capability:
                  adapter
                    .capability,
              },
            });
      }

      const result =
        AgentToolResultSchema.parse(
          await adapter.invoke({
            args,

            context: {
              agentId:
                this.profile
                  .agentId,

              taskId:
                this.task
                  .taskId,

              workflowId:
                this.task
                  .workflowId,
            },

            credentials,

            signal:
              this.signal,
          }),
        );

      const completedAt =
        this.clock();

      this.provenance.push(
        ...result.provenance,
      );

      this.traces.push({
        sequence,
        toolId:
          adapter.id,
        capability:
          adapter.capability,
        startedAt,
        completedAt,
        success: true,
        provenanceCount:
          result.provenance
            .length,
      });

      return result;
    } catch (error) {
      const completedAt =
        this.clock();

      this.traces.push({
        sequence,
        toolId:
          adapter.id,
        capability:
          adapter.capability,
        startedAt,
        completedAt,
        success: false,
        provenanceCount: 0,
        error:
          errorMessage(
            error,
          ),
      });

      throw error;
    }
  }

  getCallCount():
    number {
    return this.callCount;
  }

  getTraces():
    AgentToolCallTrace[] {
    return structuredClone(
      this.traces,
    );
  }

  getProvenance():
    z.infer<
      typeof ProvenanceRefSchema
    >[] {
    return structuredClone(
      this.provenance,
    );
  }
}
