import { z } from 'zod';

import {
  AgentExecutorOutputSchema,
  type AgentExecutorOutputInput,
} from '@/lib/control-plane/agent-executor';

import type {
  AgentExecutorContext,
} from '@/lib/control-plane/agent-executor';

import type {
  AgentBrainContext,
} from '@/lib/control-plane/brain-context-provider';

import type {
  AgentToolDescriptor,
  AgentToolInvoker,
} from '@/lib/control-plane/agent-tool-runtime';

import type {
  CompanyAgentRuntimeProfile,
} from '@/lib/control-plane/agent-runtime-profile';

export const AgentModelUsageSchema = z.object({
  inputTokens:
    z.number().int().min(0),

  outputTokens:
    z.number().int().min(0),

  cachedInputTokens:
    z.number().int().min(0).default(0),

  reasoningTokens:
    z.number().int().min(0).default(0),

  estimatedCostUsd:
    z.number().finite().min(0).optional(),
});

export const AgentModelExecutionResultSchema = z.object({
  output:
    AgentExecutorOutputSchema,

  usage:
    AgentModelUsageSchema,

  model:
    z.string().min(1).optional(),

  finishReason:
    z.string().min(1).optional(),

  metadata:
    z.record(z.unknown()).default({}),
});

export type AgentModelExecutionResult = z.infer<
  typeof AgentModelExecutionResultSchema
>;

export type AgentModelExecutionResultInput = z.input<
  typeof AgentModelExecutionResultSchema
>;

export type AgentModelExecutionInput = {
  executionId: string;

  profile:
    CompanyAgentRuntimeProfile;

  task:
    AgentExecutorContext['task'];

  workflow:
    AgentExecutorContext['workflow'];

  brain:
    AgentBrainContext;

  availableTools:
    AgentToolDescriptor[];

  idempotencyKey: string;

  constraints: {
    maxToolCalls: number;
    maxInputTokens: number;
    maxOutputTokens: number;
    maxOutputChars: number;
    timeoutMs: number;

    hiddenChainOfThoughtMustNotBePersisted: true;
    financialExecutionToolsAvailable: false;
    workflowMutationOnlyThroughControlPlane: true;
  };
};

export interface AgentModelAdapter {
  id: string;

  execute(input: {
    execution:
      AgentModelExecutionInput;

    tools:
      AgentToolInvoker;

    signal:
      AbortSignal;
  }): Promise<
    AgentModelExecutionResultInput
  >;
}

export function normalizeAgentModelExecutionResult(
  input:
    AgentModelExecutionResultInput,
): AgentModelExecutionResult {
  return AgentModelExecutionResultSchema.parse(
    input,
  );
}

export type {
  AgentExecutorOutputInput,
};
