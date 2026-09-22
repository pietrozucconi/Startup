import { z } from 'zod';

import {
  AgentCredentialHandleSchema,
  type AgentCredentialResolveContext,
  type AgentCredentialVault,
  type ToolCredentialLease,
} from '@/lib/control-plane/credential-vault';

import {
  AgentToolCapabilitySchema,
  type AgentToolCapability,
} from '@/lib/control-plane/agent-runtime-profile';

import type { RuntimeSecretSource } from '@/lib/control-plane/runtime-secret-source';

const RecordSchema = z.object({
  handle: AgentCredentialHandleSchema,
  provider: z.string().min(1),
  secretNames: z.record(z.string().min(1)),
  allowedAgentIds: z.array(z.string().min(1)).default([]),
  allowedCapabilities: z.array(AgentToolCapabilitySchema).default([]),
});

type VaultRecord = z.infer<typeof RecordSchema>;
type VaultRecordInput = z.input<typeof RecordSchema>;

class EnvLease implements ToolCredentialLease {
  constructor(
    readonly provider: string,
    private readonly source: RuntimeSecretSource,
    private readonly secretNames: Record<string, string>,
  ) {}

  has(key: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.secretNames, key);
  }

  get(key: string): string {
    const envName = this.secretNames[key];
    if (!envName) throw new Error(`credential_value_not_found:${key}`);
    return this.source.getSecret(envName);
  }
}

export class EnvironmentAgentCredentialVault implements AgentCredentialVault {
  private readonly records = new Map<string, VaultRecord>();

  constructor(private readonly source: RuntimeSecretSource) {}

  register(input: VaultRecordInput): void {
    const record = RecordSchema.parse(input);
    if (this.records.has(record.handle)) {
      throw new Error(`credential_handle_already_registered:${record.handle}`);
    }
    this.records.set(record.handle, record);
  }

  async resolve(input: {
    handle: string;
    context: AgentCredentialResolveContext;
  }): Promise<ToolCredentialLease> {
    const handle = AgentCredentialHandleSchema.parse(input.handle);
    const record = this.records.get(handle);
    if (!record) throw new Error(`credential_handle_not_found:${handle}`);

    if (
      record.allowedAgentIds.length > 0 &&
      !record.allowedAgentIds.includes(input.context.agentId)
    ) {
      throw new Error(`credential_agent_denied:${input.context.agentId}:${handle}`);
    }

    if (
      record.allowedCapabilities.length > 0 &&
      !record.allowedCapabilities.includes(input.context.capability)
    ) {
      throw new Error(
        `credential_capability_denied:${input.context.capability}:${handle}`,
      );
    }

    return new EnvLease(record.provider, this.source, record.secretNames);
  }
}

export function agentsWithCapability(
  profiles: Array<{
    agentId: string;
    allowedToolCapabilities: AgentToolCapability[];
  }>,
  capability: AgentToolCapability,
): string[] {
  return profiles
    .filter((p) => p.allowedToolCapabilities.includes(capability))
    .map((p) => p.agentId);
}
