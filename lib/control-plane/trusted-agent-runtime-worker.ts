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
  AgentCredentialVault,
} from '@/lib/control-plane/credential-vault';

import type {
  AgentModelAdapter,
} from '@/lib/control-plane/agent-model-adapter';

import type {
  AgentReadToolRegistry,
} from '@/lib/control-plane/agent-tool-runtime';

import {
  getCompanyAgentRuntimeProfile,
} from '@/lib/control-plane/agent-runtime-profile';

import {
  ObservedAgentExecutor,
} from '@/lib/control-plane/observed-agent-executor';

import type {
  RuntimeAgentSessionClaims,
  RuntimeIdentityVerifier,
} from '@/lib/control-plane/runtime-identity';

import type {
  AtomicControlPlaneStore,
} from '@/lib/control-plane/atomic-store';

import type {
  HardenedRuntimeStore,
} from '@/lib/control-plane/hardened-runtime-store';

type TrustedWorkerStore =
  HardenedRuntimeStore &
  AtomicControlPlaneStore;

export class TrustedCompanyAgentRuntimeWorker {
  private readonly profile;

  private readonly runner:
    GovernedAgentExecutorRunner;

  private readonly initialClaims:
    RuntimeAgentSessionClaims;

  private readonly clock:
    () => string;

  constructor(
    private readonly input: {
      agentId: string;

      identityToken:
        string;

      identityVerifier:
        RuntimeIdentityVerifier;

      store:
        TrustedWorkerStore;

      modelAdapter:
        AgentModelAdapter;

      brainContext:
        AgentBrainContextProvider;

      toolRegistry:
        AgentReadToolRegistry;

      credentialVault?:
        AgentCredentialVault;

      runner:
        Omit<
          AgentExecutorRunnerOptions,
          'principalSessionId'
        >;

      clock?: () => string;
    },
  ) {
    this.clock =
      input.clock ??
      (() =>
        new Date().toISOString());

    this.profile =
      getCompanyAgentRuntimeProfile(
        input.agentId,
      );

    this.initialClaims =
      input.identityVerifier.verifyAgentSession({
        token:
          input.identityToken,

        expectedProfile:
          this.profile,

        now:
          this.clock(),
      });

    input.store.registerRuntimeWorker({
      workerId:
        input.runner.workerId,
      agentId:
        input.agentId,
      sessionId:
        this.initialClaims.sessionId,
      startedAt:
        this.clock(),
      metadata: {
        modelAdapterId:
          input.modelAdapter.id,
        trustedRuntime:
          true,
      },
    });

    const bounded =
      new BoundedModelAgentExecutor(
        this.profile,
        input.modelAdapter,
        input.brainContext,
        input.toolRegistry,
        this.clock,
        input.credentialVault,
      );

    const observed =
      new ObservedAgentExecutor(
        bounded,
        input.store,
        {
          workerId:
            input.runner.workerId,
          sessionId:
            this.initialClaims.sessionId,
        },
        this.clock,
      );

    this.runner =
      new GovernedAgentExecutorRunner(
        input.store,
        observed,
        {
          ...input.runner,

          principalSessionId:
            this.initialClaims.sessionId,
        },
        this.clock,
      );
  }

  get sessionId():
    string {
    return this.initialClaims.sessionId;
  }

  get workerId():
    string {
    return this.input.runner.workerId;
  }

  async runOnce() {
    const claims =
      this.input.identityVerifier.verifyAgentSession({
        token:
          this.input.identityToken,

        expectedProfile:
          this.profile,

        now:
          this.clock(),
      });

    if (
      claims.sessionId !==
      this.initialClaims.sessionId
    ) {
      throw new Error(
        'runtime_identity_session_changed',
      );
    }

    this.input.store.heartbeatRuntimeWorker({
      workerId:
        this.workerId,
      agentId:
        this.profile.agentId,
      sessionId:
        this.sessionId,
      at:
        this.clock(),
    });

    try {
      return await this.runner.runOnce();
    } finally {
      this.input.store.heartbeatRuntimeWorker({
        workerId:
          this.workerId,
        agentId:
          this.profile.agentId,
        sessionId:
          this.sessionId,
        at:
          this.clock(),
      });
    }
  }

  stop(
    reason =
      'runtime_worker_stopped',
  ) {
    return this.input.store.stopRuntimeWorker({
      workerId:
        this.workerId,
      agentId:
        this.profile.agentId,
      sessionId:
        this.sessionId,
      stoppedAt:
        this.clock(),
      reason,
    });
  }
}
