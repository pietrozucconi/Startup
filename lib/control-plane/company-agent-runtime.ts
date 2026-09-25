import {
  randomBytes,
  randomUUID,
} from 'node:crypto';

import {
  getDb,
} from '@/lib/data';

import {
  getControlPlaneRuntimeStore,
} from '@/lib/control-plane/runtime-data';

import {
  AssignedOmniRouteModelAdapter,
} from '@/lib/control-plane/assigned-model-adapter';

import {
  AgentReadToolRegistry,
} from '@/lib/control-plane/agent-tool-runtime';

import {
  getStartupBrainContextProvider,
} from '@/lib/control-plane/startup-brain-runtime';

import {
  getCompanyAgentRuntimeProfile,
} from '@/lib/control-plane/agent-runtime-profile';

import {
  EnvironmentRuntimeSecretSource,
} from '@/lib/control-plane/runtime-secret-source';

import {
  HmacRuntimeIdentityAuthority,
} from '@/lib/control-plane/runtime-identity';

import {
  TrustedCompanyAgentRuntimeWorker,
} from '@/lib/control-plane/trusted-agent-runtime-worker';


const runtimeIdentityAuthority =
  new HmacRuntimeIdentityAuthority(
    randomBytes(32),
  );


export function createCompanyAgentRuntimeWorker(
  agentId: string,
): TrustedCompanyAgentRuntimeWorker {
  const profile =
    getCompanyAgentRuntimeProfile(
      agentId,
    );

  const companyDb =
    getDb();

  const store =
    getControlPlaneRuntimeStore();

  const secretSource =
    new EnvironmentRuntimeSecretSource(
      process.env,
    );
  

  const brainContext =
  getStartupBrainContextProvider(
    process.env,
  );


  const modelAdapter =
    new AssignedOmniRouteModelAdapter({
      resolveAssignedModel:
        (
          requestedAgentId,
        ) =>
          companyDb
            .agents
            .byId(
              requestedAgentId,
            )
            ?.model ??
          null,

      secretSource,

      baseUrl:
        process.env
          .OMNIROUTE_BASE_URL,
    });

  const toolRegistry =
    new AgentReadToolRegistry();

  const issued =
    runtimeIdentityAuthority
      .issueAgentSession({
        profile,

        ttlMs:
          15 *
          60 *
          1000,
      });

  const workerId =
    `company-agent-worker:${agentId}:${randomUUID()}`;

  return new TrustedCompanyAgentRuntimeWorker({
    agentId,

    identityToken:
      issued.token,

    identityVerifier:
      runtimeIdentityAuthority,

    store,

    modelAdapter,

    brainContext,

    toolRegistry,

    runner: {
      workerId,

      batchSize:
        1,

      leaseMs:
        5 *
        60 *
        1000,
    },
  });
}


export async function runCompanyAgentOnce(
  agentId: string,
) {
  const worker =
    createCompanyAgentRuntimeWorker(
      agentId,
    );

  try {
    return await worker.runOnce();
  } finally {
    worker.stop(
      'company_agent_run_once_completed',
    );
  }
}


import {
  companyAgentIds,
} from '@/lib/control-plane/internal-runtime-adapters';


export type CompanyRuntimeCycleResult = {
  agentId: string;

  claimed: number;
  completed: number;
  failed: number;
};


export async function runCompanyRuntimeCycle():
  Promise<CompanyRuntimeCycleResult[]> {
  const results:
    CompanyRuntimeCycleResult[] =
    [];


  for (
    const agentId
    of companyAgentIds()
  ) {
    const result =
      await runCompanyAgentOnce(
        agentId,
      );


    results.push({
      agentId,

      claimed:
        result.claimed,

      completed:
        result.completed,

      failed:
        result.failed,
    });
  }


  return results;
}

export async function runReadyCompanyAgents(
  now =
    new Date().toISOString(),
): Promise<CompanyRuntimeCycleResult[]> {
  const store =
    getControlPlaneRuntimeStore();


  const nowMs =
    Date.parse(now);


  const runnableAgentIds =
    new Set(
      store
        .listAgentRuntimeTasks()
        .filter(
          (
            task,
          ) => {
            if (
              task.status ===
              'queued'
            ) {
              return (
                Date.parse(
                  task.availableAt,
                ) <=
                nowMs
              );
            }


            if (
              task.status ===
                'running' &&
              task.leaseUntil
            ) {
              return (
                Date.parse(
                  task.leaseUntil,
                ) <=
                nowMs
              );
            }


            return false;
          },
        )
        .map(
          (
            task,
          ) =>
            task.agentId,
        ),
    );


  const agentsToRun =
    companyAgentIds()
      .filter(
        (
          agentId,
        ) =>
          runnableAgentIds.has(
            agentId,
          ),
      );


  const results:
    CompanyRuntimeCycleResult[] =
    [];


  for (
    const agentId
    of agentsToRun
  ) {
    const result =
      await runCompanyAgentOnce(
        agentId,
      );


    results.push({
      agentId,

      claimed:
        result.claimed,

      completed:
        result.completed,

      failed:
        result.failed,
    });
  }


  return results;
}