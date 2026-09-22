import {
  GovernedAgentExecutorRunner,
  type AgentExecutorRunnerOptions,
} from '@/lib/control-plane/agent-executor';

import {
  BoundedModelAgentExecutor,
} from '@/lib/control-plane/bounded-agent-executor';

import type {
  AgentBrainContextProvider,
} from '@/lib/control-plane/brain-context-provider';

import type {
  AgentModelAdapter,
} from '@/lib/control-plane/agent-model-adapter';

import type {
  AgentReadToolRegistry,
} from '@/lib/control-plane/agent-tool-runtime';

import {
  getCompanyAgentRuntimeProfile,
} from '@/lib/control-plane/agent-runtime-profile';

import type {
  AtomicControlPlaneStore,
} from '@/lib/control-plane/atomic-store';

import type {
  InternalRuntimeStore,
} from '@/lib/control-plane/runtime-store';

type CompanyAgentWorkerStore =
  InternalRuntimeStore &
  AtomicControlPlaneStore;

/**
 * Composes the V2H context/tool/model boundary with the V2G governed runner.
 *
 * This object performs one finite polling iteration. Scheduling/process
 * supervision remains infrastructure-owned; the worker never self-schedules.
 */
export class CompanyAgentRuntimeWorker {
  private readonly runner:
    GovernedAgentExecutorRunner;

  constructor(input: {
    agentId: string;
    store:
      CompanyAgentWorkerStore;
    modelAdapter:
      AgentModelAdapter;
    brainContext:
      AgentBrainContextProvider;
    toolRegistry:
      AgentReadToolRegistry;
    runner:
      AgentExecutorRunnerOptions;
    clock?: () => string;
  }) {
    const clock =
      input.clock ??
      (() =>
        new Date().toISOString());

    const profile =
      getCompanyAgentRuntimeProfile(
        input.agentId,
      );

    const executor =
      new BoundedModelAgentExecutor(
        profile,
        input.modelAdapter,
        input.brainContext,
        input.toolRegistry,
        clock,
      );

    this.runner =
      new GovernedAgentExecutorRunner(
        input.store,
        executor,
        input.runner,
        clock,
      );
  }

  async runOnce() {
    return this.runner.runOnce();
  }
}
