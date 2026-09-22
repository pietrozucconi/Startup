import { z } from 'zod';

import {
  AgentToolCapabilitySchema,
  type AgentToolCapability,
} from '@/lib/control-plane/agent-runtime-profile';

export const AgentCredentialHandleSchema = z
  .string()
  .regex(
    /^cred:[a-zA-Z0-9._:-]+$/,
  );

export const AgentCredentialRecordSchema = z.object({
  handle:
    AgentCredentialHandleSchema,

  provider:
    z.string().min(1),

  values:
    z.record(
      z.string().min(1),
    ),

  allowedAgentIds:
    z.array(
      z.string().min(1),
    )
    .default([]),

  allowedCapabilities:
    z.array(
      AgentToolCapabilitySchema,
    )
    .default([]),
});

export type AgentCredentialRecordInput = z.input<
  typeof AgentCredentialRecordSchema
>;

export type AgentCredentialResolveContext = {
  agentId: string;
  taskId: string;
  workflowId?: string;
  toolId: string;
  capability:
    AgentToolCapability;
};

export interface ToolCredentialLease {
  readonly provider: string;

  has(
    key: string,
  ): boolean;

  get(
    key: string,
  ): string;
}

export interface AgentCredentialVault {
  resolve(input: {
    handle: string;
    context:
      AgentCredentialResolveContext;
  }): Promise<ToolCredentialLease>;
}

class ImmutableCredentialLease
  implements ToolCredentialLease
{
  private readonly values:
    Readonly<
      Record<
        string,
        string
      >
    >;

  constructor(
    readonly provider: string,
    values:
      Record<
        string,
        string
      >,
  ) {
    this.values =
      Object.freeze({
        ...values,
      });
  }

  has(
    key: string,
  ): boolean {
    return Object.prototype
      .hasOwnProperty.call(
        this.values,
        key,
      );
  }

  get(
    key: string,
  ): string {
    const value =
      this.values[key];

    if (!value) {
      throw new Error(
        `credential_value_not_found:${key}`,
      );
    }

    return value;
  }
}

/**
 * Test/foundation vault only.
 *
 * Production adapters should use a dedicated secret manager implementation.
 * The model never receives this object or any credential handle.
 */
export class InMemoryAgentCredentialVault
  implements AgentCredentialVault
{
  private readonly records =
    new Map<
      string,
      z.infer<
        typeof AgentCredentialRecordSchema
      >
    >();

  register(
    input:
      AgentCredentialRecordInput,
  ): void {
    const record =
      AgentCredentialRecordSchema.parse(
        input,
      );

    if (
      this.records.has(
        record.handle,
      )
    ) {
      throw new Error(
        `credential_handle_already_registered:${record.handle}`,
      );
    }

    this.records.set(
      record.handle,
      record,
    );
  }

  async resolve(input: {
    handle: string;
    context:
      AgentCredentialResolveContext;
  }): Promise<ToolCredentialLease> {
    const handle =
      AgentCredentialHandleSchema.parse(
        input.handle,
      );

    const record =
      this.records.get(
        handle,
      );

    if (!record) {
      throw new Error(
        `credential_handle_not_found:${handle}`,
      );
    }

    if (
      record
        .allowedAgentIds
        .length > 0 &&
      !record
        .allowedAgentIds
        .includes(
          input.context
            .agentId,
        )
    ) {
      throw new Error(
        `credential_agent_denied:${input.context.agentId}:${handle}`,
      );
    }

    if (
      record
        .allowedCapabilities
        .length > 0 &&
      !record
        .allowedCapabilities
        .includes(
          input.context
            .capability,
        )
    ) {
      throw new Error(
        `credential_capability_denied:${input.context.capability}:${handle}`,
      );
    }

    return new ImmutableCredentialLease(
      record.provider,
      record.values,
    );
  }
}
