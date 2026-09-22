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
  EmptyAgentBrainContextProvider,
} from '@/lib/control-plane/brain-context-provider';

import {
  buildFirstRealProviderBundle,
} from '@/lib/control-plane/first-real-provider-bundle';

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

function loadLocalEnvironment() {
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

function requireLiveSecret(
  name: string,
): void {
  if (
    !process.env[name]
      ?.trim()
  ) {
    throw new Error(
      [
        `live_sandbox_missing_secret:${name}`,
        'Create .env.local locally and add the required provider key.',
        'Never paste provider secrets into chat or commit them to git.',
      ].join('|'),
    );
  }
}

function safeSymbol(
  raw: string,
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

  requireLiveSecret(
    'ANTHROPIC_API_KEY',
  );

  requireLiveSecret(
    'TAVILY_API_KEY',
  );

  requireLiveSecret(
    'ALPHA_VANTAGE_API_KEY',
  );

  const symbol =
    safeSymbol(
      process.argv[2] ??
      'AAPL',
    );

  const dbPath =
    process.env
      .STARTUP_LIVE_SANDBOX_DB ??
    path.join(
      process.cwd(),
      'data',
      'live-provider-sandbox.db',
    );

  mkdirSync(
    path.dirname(
      dbPath,
    ),
    {
      recursive: true,
    },
  );

  const store =
    new SqliteHardenedRuntimeStore(
      dbPath,
    );

  try {
    const runKey =
      randomUUID();

    const workflowId =
      `live-sandbox:${symbol}:${runKey}`;

    const taskId =
      `live-task:${symbol}:${runKey}`;

    const handoffId =
      `live-handoff:${symbol}:${runKey}`;

    const workerId =
      `live-lauti-worker:${runKey}`;

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
          15 * 60 * 1000,
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
        `live-create:${runKey}`,

      workflowId,

      principal,

      responsibleResearchAgentId:
        'lauti',

      assetRef:
        symbol,

      reason:
        'V2J.2 live provider sandbox research workflow.',

      metadata: {
        sandbox:
          true,

        liveProviders:
          [
            'anthropic',
            'tavily',
            'alpha-vantage',
          ],

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
        `live-start-research:${runKey}`,

      workflowId,

      principal,

      fromState:
        'DRAFT',

      toState:
        'RESEARCHING',

      expectedRevision:
        created.revision,

      reason:
        'Begin sandbox equity research.',
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
        'live_equity_research_sandbox',

      summary: [
        `Research ${symbol} as a V2J.2 sandbox task.`,
        'This is research only: do not execute or authorize any financial action.',
        `Use tavily-web-search at least once for current external evidence about ${symbol}.`,
        `Use alpha-vantage-market with {"operation":"quote","symbol":"${symbol}"} at least once.`,
        'If evidence is sufficient, register a research_proposal artifact.',
        'If the research proposal is ready for independent challenge, request RESEARCHING -> READY_FOR_RED_DESK.',
        'If a provider fails or evidence is insufficient, record that limitation in the governed output instead of inventing data.',
      ].join(' '),

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
          180_000,
      },

      policyEvidence: [
        'sandbox:v2j2-real-provider',
        'financial-execution:forbidden',
      ],

      payload: {
        symbol,
        sandbox:
          true,
        requiredEvidenceTools: [
          'tavily-web-search',
          'alpha-vantage-market',
        ],
      },
    });

    const bundle =
      buildFirstRealProviderBundle({
        env:
          process.env,

        anthropicModel:
          process.env
            .ANTHROPIC_MODEL ??
          'claude-sonnet-5',
      });

    const worker =
      new TrustedCompanyAgentRuntimeWorker({
        agentId:
          'lauti',

        identityToken:
          issued.token,

        identityVerifier:
          authority,

        store,

        modelAdapter:
          bundle.modelAdapter,

        brainContext:
          new EmptyAgentBrainContextProvider(),

        toolRegistry:
          bundle.toolRegistry,

        credentialVault:
          bundle.credentialVault,

        runner: {
          workerId,
          batchSize:
            1,
          leaseMs:
            5 * 60 * 1000,
        },
      });

    console.log(
      '\n=== V2J.2 LIVE SANDBOX START ===',
    );

    console.log(
      `symbol: ${symbol}`,
    );

    console.log(
      `workflow: ${workflowId}`,
    );

    console.log(
      `model: ${process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-5'}`,
    );

    const result =
      await worker.runOnce();

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
      workflow.artifacts
        .map(
          (artifact) => ({
            id:
              artifact.id,
            kind:
              artifact.kind,
            summary:
              artifact.summary,
            status:
              artifact.status,
            runtimeEvidence:
              artifact.metadata
                .runtimeEvidence,
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
          artifacts,
          activeInvalidations:
            workflow.invalidations
              .filter(
                (item) =>
                  item.status ===
                  'active',
              ),
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

    const usedTools =
      runs
        .flatMap(
          (run) => {
            const runtime =
              run.metadata
                .runtime;

            if (
              !runtime ||
              typeof runtime !==
                'object'
            ) {
              return [];
            }

            const toolCalls =
              (
                runtime as
                Record<
                  string,
                  unknown
                >
              ).toolCalls;

            return Array.isArray(
              toolCalls,
            )
              ? toolCalls
              : [];
          },
        )
        .map(
          (call) =>
            (
              call as
              Record<
                string,
                unknown
              >
            ).toolId,
        );

    console.log(
      '\n=== LIVE PROVIDER CHECK ===',
    );

    console.log(
      JSON.stringify(
        {
          anthropicRunRecorded:
            runs.length >
            0,

          tavilyUsed:
            usedTools.includes(
              'tavily-web-search',
            ),

          alphaVantageUsed:
            usedTools.includes(
              'alpha-vantage-market',
            ),

          finalWorkflowState:
            workflow.state,

          researchProposalRegistered:
            workflow.artifacts.some(
              (artifact) =>
                artifact.kind ===
                'research_proposal',
            ),
        },
        null,
        2,
      ),
    );

    if (
      result.failed >
      0
    ) {
      process.exitCode =
        1;
    }

    console.log(
      '\n=== V2J.2 LIVE SANDBOX END ===\n',
    );
  } finally {
    store.close();
  }
}

main().catch(
  (error) => {
    console.error(
      '\nV2J.2 live sandbox failed:',
      error,
    );

    process.exitCode =
      1;
  },
);
