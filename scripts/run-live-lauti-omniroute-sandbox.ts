import {
  existsSync,
  mkdirSync,
} from 'node:fs';

import path from 'node:path';

import {
  loadEnvFile,
} from 'node:process';

import {
  randomBytes,
  randomUUID,
} from 'node:crypto';

import {
  AtomicCompanyControlPlane,
} from '@/lib/control-plane/atomic-engine';

import {
  BrainGatewayAgentContextProvider,
} from '@/lib/control-plane/brain-context-provider';

import {
  BrainGateway,
} from '@/lib/brain/gateway/gateway';

import {
  InMemoryBrainAuditStore,
  InMemoryBrainGraphStore,
} from '@/lib/brain/gateway/store';

import {
  createEmptyBrainGraph,
} from '@/lib/brain/graph-ops';

import {
  CogneeRecallClient,
} from '@/lib/brain/cognee/cognee-recall-client';

import {
  CogneeBrainRetrievalBackend,
} from '@/lib/brain/cognee/cognee-brain-retrieval-backend';



import {
  AssignedOmniRouteModelAdapter,
} from '@/lib/control-plane/assigned-model-adapter';

import {
  AgentReadToolRegistry,
} from '@/lib/control-plane/agent-tool-runtime';

import {
  EnvironmentRuntimeSecretSource,
} from '@/lib/control-plane/runtime-secret-source';

import {
  openDb,
} from '@/lib/db';

import {
  getCompanyAgentRuntimeProfile,
} from '@/lib/control-plane/agent-runtime-profile';

import {
  HmacRuntimeIdentityAuthority,
} from '@/lib/control-plane/runtime-identity';

import {
  SqliteHardenedRuntimeStore,
} from '@/lib/control-plane/sqlite-hardened-runtime-store';

import {
  TrustedCompanyAgentRuntimeWorker,
} from '@/lib/control-plane/trusted-agent-runtime-worker';


function loadLocalEnvironment(): void {
  const envLocal =
    path.join(
      process.cwd(),
      '.env.local',
    );

  if (
    existsSync(
      envLocal,
    )
  ) {
    loadEnvFile(
      envLocal,
    );
  }
}


function requireSecret(
  name:
    string,
): void {
  const value =
    process.env[
      name
    ];

  if (
    !value ||
    !value.trim()
  ) {
    throw new Error(
      [
        `live_sandbox_missing_secret:${name}`,
        'The secret must exist in .env.local.',
        'Never paste secrets into chat or commit them to git.',
      ].join(
        '|',
      ),
    );
  }
}



function safeSymbol(
  raw:
    string,
): string {
  const value =
    raw
      .trim()
      .toUpperCase();

  if (
    !/^[A-Z0-9.^_-]{1,20}$/.test(
      value,
    )
  ) {
    throw new Error(
      `invalid_sandbox_symbol:${raw}`,
    );
  }

  return value;
}


async function main() {
  loadLocalEnvironment();


requireSecret(
  'OMNIROUTE_API_KEY',
);

requireSecret(
  'COGNEE_API_PASSWORD',
);


const symbol =
  safeSymbol(
    process.argv[2] ??
    'AAPL',
  );


const companyDbPath =
  process.env
    .STARTUP_DB ??
  path.join(
    process.cwd(),
    'data',
    'startup.db',
  );


const companyDb =
  openDb(
    companyDbPath,
  );


const configuredAgent =
  companyDb
    .agents
    .byId(
      'lauti',
    );


if (
  !configuredAgent
) {
  companyDb.close();

  throw new Error(
    'live_sandbox_lauti_not_found_in_company_db',
  );
}


const configuredModel =
  configuredAgent
    .model
    .trim();


if (
  !configuredModel ||
  configuredModel ===
    'unassigned'
) {
  companyDb.close();

  throw new Error(
    'live_sandbox_lauti_model_not_assigned',
  );
}


  const dbPath =
    process.env
      .STARTUP_OMNIROUTE_SANDBOX_DB ??
    path.join(
      process.cwd(),
      'data',
      'live-omniroute-sandbox.db',
    );


  mkdirSync(
    path.dirname(
      dbPath,
    ),
    {
      recursive:
        true,
    },
  );


  const store =
    new SqliteHardenedRuntimeStore(
      dbPath,
    );


  let worker:
    TrustedCompanyAgentRuntimeWorker |
    null =
    null;


  try {
    const runKey =
      randomUUID();


    const workflowId =
      `omniroute-sandbox:${symbol}:${runKey}`;


    const taskId =
      `omniroute-task:${symbol}:${runKey}`;


    const handoffId =
      `omniroute-handoff:${symbol}:${runKey}`;


    const workerId =
      `omniroute-lauti-worker:${runKey}`;


    const profile =
      getCompanyAgentRuntimeProfile(
        'lauti',
      );


    const authority =
      new HmacRuntimeIdentityAuthority(
        randomBytes(
          32,
        ),
      );


    const issued =
      authority.issueAgentSession({
        profile,

        ttlMs:
          15 *
          60 *
          1000,
      });


    const principal = {
      actor: {
        kind:
          'agent' as const,

        id:
          'lauti',
      },

      sessionId:
        issued.claims
          .sessionId,
    };


    const controlPlane =
      new AtomicCompanyControlPlane(
        store,
      );


    await controlPlane.createWorkflow({
      requestId:
        `omniroute-create:${runKey}`,

      workflowId,

      principal,

      responsibleResearchAgentId:
        'lauti',

      assetRef:
        symbol,

      reason:
        'V2K.1A OmniRoute live runtime sandbox.',

      metadata: {
        sandbox:
          true,

        modelGateway:
          'omniroute',

        assignedModel:
          configuredModel,

        modelAssignmentMode:
          'manual',

        assignedBy:
          'ceo',

        startupBrainEnabled:
          true,

        externalResearchToolsEnabled:
          false,

        financialExecutionAllowed:
          false,
      },
    });


    const created =
      await controlPlane
        .getWorkflow(
          workflowId,
        );


    await controlPlane.transition({
      requestId:
        `omniroute-start-research:${runKey}`,

      workflowId,

      principal,

      fromState:
        'DRAFT',

      toState:
        'RESEARCHING',

      expectedRevision:
        created.revision,

      reason:
        'Begin isolated OmniRoute runtime sandbox.',
    });


    const now =
      new Date()
        .toISOString();


    store.upsertAgentRuntimeTask({
      taskId,

      handoffId,

      workflowId,

      agentId:
        'lauti',

      action:
        'omniroute_runtime_connectivity_test',

      summary: [
        `Create a sandbox-only research proposal skeleton for ${symbol}.`,
        'This task exists only to validate the company runtime and model gateway.',
        'Startup Brain context is enabled for this test.',
        'Use relevant institutional memory supplied by Startup Brain.',
        'External research tools remain disabled.',
        'Do not claim or invent current market facts, prices, financial results, news or filings.',
        'Explicitly state that no live external evidence was used.',
        'Register exactly one research_proposal artifact.',
        'Do not request any workflow transition.',
        'Do not record or resolve invalidations.',
        'Do not execute or authorize any financial action.',
      ].join(
        ' ',
      ),

      stateAtAssignment:
        'RESEARCHING',

      createdAt:
        now,

      availableAt:
        now,

      updatedAt:
        now,

      retryPolicy: {
        maxAttempts:
          1,

        initialDelayMs:
          1_000,

        backoffMultiplier:
          2,

        maxDelayMs:
          10_000,

        timeoutMs:
          120_000,
      },

      policyEvidence: [
        'sandbox:v2k1a-omniroute',
        `manual-model:${configuredModel}`,
        'startup-brain:enabled-via-cognee',
        'external-tools:disabled-for-connectivity-test',
        'financial-execution:forbidden',
      ],

      payload: {
        symbol,

        sandbox:
          true,

        assignedModel:
          configuredModel,

        modelAssignmentMode:
          'manual',

        startupBrainEnabled:
          true,

        externalResearchToolsEnabled:
          false,
      },
    });


const secretSource =
  new EnvironmentRuntimeSecretSource(
    process.env,
  );


const toolRegistry =
  new AgentReadToolRegistry();

const cogneeBaseUrl =
  process.env
    .COGNEE_BASE_URL ??
  'http://127.0.0.1:8000';


const cogneeEmail =
  process.env
    .COGNEE_API_EMAIL ??
  'default_user@example.com';


const cogneeDataset =
  process.env
    .COGNEE_DATASET ??
  'startup_brain_smoke';


const cogneeClient =
  new CogneeRecallClient({
    baseUrl:
      cogneeBaseUrl,

    email:
      cogneeEmail,

    passwordSecretName:
      'COGNEE_API_PASSWORD',

    secretSource,
  });


const cogneeRetrievalBackend =
  new CogneeBrainRetrievalBackend({
    client:
      cogneeClient,

    dataset:
      cogneeDataset,

    readableByAgentIds: [
      'lauti',
    ],

    readableByDepartmentIds: [
      'dept-research',
    ],
  });


const brainGraphStore =
  new InMemoryBrainGraphStore(
    createEmptyBrainGraph(
      'startup-brain-runtime',
      new Date()
        .toISOString(),
    ),
  );


const brainAuditStore =
  new InMemoryBrainAuditStore();


const brainGateway =
  new BrainGateway(
    brainGraphStore,
    brainAuditStore,
    undefined,
    cogneeRetrievalBackend,
  );


const brainContext =
  new BrainGatewayAgentContextProvider(
    brainGateway,
  );


const modelAdapter =
  new AssignedOmniRouteModelAdapter({
    resolveAssignedModel:
      (
        agentId,
      ) =>
        companyDb
          .agents
          .byId(
            agentId,
          )
          ?.model ??
        null,

    secretSource,

    baseUrl:
      process.env
        .OMNIROUTE_BASE_URL,
  });



    worker =
      new TrustedCompanyAgentRuntimeWorker({
        agentId:
          'lauti',

        identityToken:
          issued.token,

        identityVerifier:
          authority,

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


    console.log(
      '\n=== V2K.1A OMNIROUTE LIVE SANDBOX START ===',
    );


    console.log(
      `agent: lauti`,
    );


    console.log(
      `symbol: ${symbol}`,
    );


    console.log(
      `manually assigned model: ${configuredModel}`,
    );


    console.log(
      `workflow: ${workflowId}`,
    );


    const result =
      await worker
        .runOnce();


    const workflow =
      await controlPlane
        .getWorkflow(
          workflowId,
        );


    const task =
      store
        .listAgentRuntimeTasks({
          agentId:
            'lauti',

          workflowId,
        })[0];


    const runs =
      store
        .listExecutionRuns({
          taskId,
        });


    const artifacts =
      workflow
        .artifacts
        .map(
          (
            artifact,
          ) => ({
            id:
              artifact.id,

            kind:
              artifact.kind,

            summary:
              artifact.summary,

            status:
              artifact.status,

            createdBy:
              artifact.createdBy,
          }),
        );


    console.log(
      '\n=== WORKER RESULT ===',
    );


    console.log(
      JSON.stringify(
        result,
        null,
        2,
      ),
    );


    console.log(
      '\n=== TASK ===',
    );


    console.log(
      JSON.stringify(
        {
          taskId:
            task?.taskId,

          status:
            task?.status,

          attempts:
            task?.attempts,

          lastError:
            task?.lastError,

          result:
            task?.result,
        },
        null,
        2,
      ),
    );


    console.log(
      '\n=== WORKFLOW ===',
    );


    console.log(
      JSON.stringify(
        {
          id:
            workflow.id,

          state:
            workflow.state,

          revision:
            workflow.revision,

          assetRef:
            workflow.assetRef,

          assignedModel:
            workflow
              .metadata
              .assignedModel,

          modelAssignmentMode:
            workflow
              .metadata
              .modelAssignmentMode,

          artifacts,
        },
        null,
        2,
      ),
    );


    console.log(
      '\n=== EXECUTION LEDGER ===',
    );


    console.log(
      JSON.stringify(
        runs,
        null,
        2,
      ),
    );


    const researchProposalRegistered =
      workflow
        .artifacts
        .some(
          (
            artifact,
          ) =>
            artifact.kind ===
            'research_proposal',
        );


    const succeededRun =
      runs.some(
        (
          run,
        ) =>
          run.status ===
          'succeeded',
      );


    const runtimeResult =
      task?.result as
        | {
            metadata?: {
              runtime?: {
                brainNodeIds?:
                  string[];

                modelMetadata?: {
                  modelAssignment?: {
                    pinnedModel?:
                      string;

                    automaticFallback?:
                      boolean;
                  };
                };
              };
            };
          }
        | undefined;

    const startupBrainNodeIds =
      runtimeResult
        ?.metadata
        ?.runtime
        ?.brainNodeIds ??
      [];

    
    const modelAssignment =
      runtimeResult
        ?.metadata
        ?.runtime
        ?.modelMetadata
        ?.modelAssignment;


    const pinnedModel =
      modelAssignment
        ?.pinnedModel;


    const automaticFallback =
      modelAssignment
        ?.automaticFallback;


console.log(
  '\n=== V2K.1C CHECK ===',
);


console.log(
  JSON.stringify(
    {
      configuredModelAtStart:
        configuredModel,

      pinnedModel,

      modelPinnedFromPersistentAssignment:
        pinnedModel ===
        configuredModel,

      automaticFallback,

      workerCompleted:
        result.completed ===
        1,

      workerFailed:
        result.failed,

      taskCompleted:
        task?.status ===
        'completed',

      executionSucceeded:
        succeededRun,

      researchProposalRegistered,

      finalWorkflowState:
        workflow.state,

      expectedWorkflowState:
        'RESEARCHING',

      startupBrainUsed:
        startupBrainNodeIds.length >
        0,

      startupBrainNodeIds,

      cogneeDataset,

      externalToolsEnabled:
        false,

      financialExecutionEnabled:
        false,
    },
    null,
    2,
  ),
);


if (
  result.failed >
    0 ||
  !succeededRun ||
  !researchProposalRegistered ||
  pinnedModel !==
    configuredModel ||
  startupBrainNodeIds.length ===
    0
) {
  process.exitCode =
    1;
}


console.log(
  '\n=== V2K.1A OMNIROUTE LIVE SANDBOX END ===\n',
);


} finally {
  if (
    worker
  ) {
    try {
      worker.stop(
        'omniroute_live_sandbox_completed',
      );
    } catch {
      // Best-effort sandbox cleanup only.
    }
  }

    store.close();
    companyDb.close();
  }
}


main()
  .catch(
    (
      error,
    ) => {
      console.error(
        '\nV2K.1A OmniRoute sandbox failed:',
        error,
      );

      process.exitCode =
        1;
    },
  );