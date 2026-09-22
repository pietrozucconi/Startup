import type { BrainMutationProposal } from '@/lib/brain/gateway/schema';
import type { InternalRuntimeStore } from '@/lib/control-plane/runtime-store';

import type {
  AgentExecutionRun,
  DurableBrainMutationProposal,
  DurableBrainProposalStatus,
  RuntimeObservabilityEvent,
  RuntimeWorkerRecord,
} from '@/lib/control-plane/hardened-runtime-schema';

export interface HardenedRuntimeStore extends InternalRuntimeStore {
  registerRuntimeWorker(input: {
    workerId: string;
    agentId: string;
    sessionId: string;
    startedAt: string;
    metadata?: Record<string, unknown>;
  }): RuntimeWorkerRecord;

  heartbeatRuntimeWorker(input: {
    workerId: string;
    agentId: string;
    sessionId: string;
    at: string;
  }): RuntimeWorkerRecord;

  stopRuntimeWorker(input: {
    workerId: string;
    agentId: string;
    sessionId: string;
    stoppedAt: string;
    reason?: string;
  }): RuntimeWorkerRecord;

  listRuntimeWorkers(input?: {
    agentId?: string;
    status?: RuntimeWorkerRecord['status'];
  }): RuntimeWorkerRecord[];

  listStaleRuntimeWorkers(input: {
    now: string;
    staleAfterMs: number;
  }): RuntimeWorkerRecord[];

  startExecutionRun(input: {
    runId: string;
    taskId: string;
    handoffId: string;
    workflowId?: string;
    agentId: string;
    workerId: string;
    sessionId: string;
    executorId: string;
    startedAt: string;
    metadata?: Record<string, unknown>;
  }): AgentExecutionRun;

  finishExecutionRun(input: {
    runId: string;
    status: 'succeeded' | 'failed';
    completedAt: string;
    model?: string;
    finishReason?: string;
    inputTokens?: number;
    outputTokens?: number;
    cachedInputTokens?: number;
    reasoningTokens?: number;
    toolCallCount?: number;
    toolFailureCount?: number;
    estimatedCostUsd?: number;
    error?: string;
    metadata?: Record<string, unknown>;
  }): AgentExecutionRun;

  listExecutionRuns(input?: {
    agentId?: string;
    workerId?: string;
    taskId?: string;
    status?: AgentExecutionRun['status'];
  }): AgentExecutionRun[];

  appendRuntimeObservabilityEvent(
    event: RuntimeObservabilityEvent,
  ): void;

  listRuntimeObservabilityEvents(input?: {
    kind?: RuntimeObservabilityEvent['kind'];
    workerId?: string;
    agentId?: string;
    runId?: string;
    proposalId?: string;
  }): RuntimeObservabilityEvent[];

  persistBrainMutationProposal(input: {
    handoffId: string;
    proposal: BrainMutationProposal;
    persistedAt: string;
  }): DurableBrainMutationProposal;

  updateBrainMutationProposal(input: {
    proposalId: string;
    status: DurableBrainProposalStatus;
    updatedAt: string;
    graphRevision?: number;
    lastError?: string;
  }): DurableBrainMutationProposal;

  getBrainMutationProposal(
    proposalId: string,
  ): DurableBrainMutationProposal | null;

  listBrainMutationProposals(input?: {
    status?: DurableBrainProposalStatus;
    handoffId?: string;
  }): DurableBrainMutationProposal[];
}

export function isHardenedRuntimeStore(
  store: InternalRuntimeStore,
): store is HardenedRuntimeStore {
  const candidate = store as Partial<HardenedRuntimeStore>;

  return (
    typeof candidate.registerRuntimeWorker === 'function' &&
    typeof candidate.heartbeatRuntimeWorker === 'function' &&
    typeof candidate.startExecutionRun === 'function' &&
    typeof candidate.finishExecutionRun === 'function' &&
    typeof candidate.persistBrainMutationProposal === 'function' &&
    typeof candidate.updateBrainMutationProposal === 'function'
  );
}
