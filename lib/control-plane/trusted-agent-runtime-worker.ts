import {
  CompanyAgentRuntimeWorker,
} from '@/lib/control-plane/agent-runtime-worker';

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

import type {
  AgentExecutorRunnerOptions,
} from '@/lib/control-plane/agent-executor';

import {
  getCompanyAgentRuntimeProfile,
} from '@/lib/control-plane/agent-runtime-profile';

import type {
  RuntimeAgentSessionClaims,
  RuntimeIdentityVerifier,
} from '@/lib/control-plane/runtime-identity';

import type {
  AtomicControlPlaneStore,
} from '@/lib/control-plane/atomic-store';

import type {
  InternalRuntimeStore,
} from '@/lib/control-plane/runtime-store';

type TrustedWorkerStore =
  InternalRuntimeStore &
  AtomicControlPlaneStore;

/**
 * Hardened entry point for future real model/provider workers.
 *
 * It refuses to create or run unless trusted infrastructure can verify a
 * signed, unexpired runtime identity that is bound to the current company
 * runtime profile.
 */
export class TrustedCompanyAgentRuntimeWorker {
  private readonly profile;

  private readonly worker:
    CompanyAgentRuntimeWorker;

  private readonly initialClaims:
    RuntimeAgentSessionClaims;

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
    this.profile =
      getCompanyAgentRuntimeProfile(
        input.agentId,
      );

    this.initialClaims =
      input.identityVerifier
        .verifyAgentSession({
          token:
            input.identityToken,

          expectedProfile:
            this.profile,

          now:
            input.clock?.(),
        });

    this.worker =
      new CompanyAgentRuntimeWorker({
        agentId:
          input.agentId,

        store:
          input.store,

        modelAdapter:
          input.modelAdapter,

        brainContext:
          input.brainContext,

        toolRegistry:
          input.toolRegistry,

        credentialVault:
          input
            .credentialVault,

        runner: {
          ...input.runner,

          principalSessionId:
            this.initialClaims
              .sessionId,
        },

        clock:
          input.clock,
      });
  }

  get sessionId():
    string {
    return this.initialClaims
      .sessionId;
  }

  async runOnce() {
    const claims =
      this.input
        .identityVerifier
        .verifyAgentSession({
          token:
            this.input
              .identityToken,

          expectedProfile:
            this.profile,

          now:
            this.input
              .clock?.(),
        });

    if (
      claims.sessionId !==
      this.initialClaims
        .sessionId
    ) {
      throw new Error(
        'runtime_identity_session_changed',
      );
    }

    return this.worker
      .runOnce();
  }
}
