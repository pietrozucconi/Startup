import {
  randomUUID,
} from 'node:crypto';

import {
  AgentExecutorOutputSchema,
  type AgentExecutor,
  type AgentExecutorContext,
  type AgentExecutorOutputInput,
} from '@/lib/control-plane/agent-executor';

import type {
  HardenedRuntimeStore,
} from '@/lib/control-plane/hardened-runtime-store';

function errorMessage(
  error: unknown,
): string {
  return error instanceof Error
    ? error.message
    : String(error);
}

function asRecord(
  value: unknown,
): Record<string, unknown> | null {
  return (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value)
  )
    ? value as Record<string, unknown>
    : null;
}

function numeric(
  value: unknown,
  fallback = 0,
): number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value)
  )
    ? value
    : fallback;
}

function optionalString(
  value: unknown,
): string | undefined {
  return (
    typeof value === 'string' &&
    value.length > 0
  )
    ? value
    : undefined;
}

export class ObservedAgentExecutor
  implements AgentExecutor
{
  readonly id: string;
  readonly agentId: string;

  constructor(
    private readonly inner: AgentExecutor,
    private readonly store: HardenedRuntimeStore,
    private readonly worker: {
      workerId: string;
      sessionId: string;
    },
    private readonly clock: () => string = () =>
      new Date().toISOString(),
  ) {
    this.id = inner.id;
    this.agentId = inner.agentId;
  }

  async execute(
    context: AgentExecutorContext,
  ): Promise<AgentExecutorOutputInput> {
    const runId =
      `execution-run:${context.task.taskId}:attempt:${context.task.attempts}:${randomUUID()}`;

    this.store.startExecutionRun({
      runId,
      taskId: context.task.taskId,
      handoffId: context.task.handoffId,
      workflowId: context.task.workflowId,
      agentId: context.task.agentId,
      workerId: this.worker.workerId,
      sessionId: this.worker.sessionId,
      executorId: this.inner.id,
      startedAt: this.clock(),
      metadata: {
        idempotencyKey: context.idempotencyKey,
      },
    });

    try {
      const output =
        AgentExecutorOutputSchema.parse(
          await this.inner.execute(context),
        );

      const runtime =
        asRecord(output.metadata.runtime);

      const usage =
        asRecord(runtime?.usage);

      const toolCalls =
        Array.isArray(runtime?.toolCalls)
          ? runtime!.toolCalls as Array<Record<string, unknown>>
          : [];

      this.store.finishExecutionRun({
        runId,
        status: 'succeeded',
        completedAt: this.clock(),
        model: optionalString(runtime?.model),
        finishReason:
          optionalString(runtime?.finishReason),
        inputTokens:
          numeric(usage?.inputTokens),
        outputTokens:
          numeric(usage?.outputTokens),
        cachedInputTokens:
          numeric(usage?.cachedInputTokens),
        reasoningTokens:
          numeric(usage?.reasoningTokens),
        toolCallCount: toolCalls.length,
        toolFailureCount:
          toolCalls.filter(
            (call) => call.success === false,
          ).length,
        estimatedCostUsd:
          typeof usage?.estimatedCostUsd === 'number'
            ? usage.estimatedCostUsd
            : undefined,
        metadata: {
          runtime: runtime ?? {},
        },
      });

      return output;
    } catch (error) {
      this.store.finishExecutionRun({
        runId,
        status: 'failed',
        completedAt: this.clock(),
        error: errorMessage(error),
      });

      throw error;
    }
  }
}
