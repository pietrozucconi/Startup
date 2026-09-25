import {
  existsSync,
} from 'node:fs';

import path from 'node:path';

import {
  loadEnvFile,
} from 'node:process';

import {
  runReadyCompanyAgents,
} from '@/lib/control-plane/company-agent-runtime';

import {
  GovernedHandoffDispatcher,
} from '@/lib/control-plane/handoff-dispatcher';

import {
  buildInternalRuntimeSinkRegistry,
} from '@/lib/control-plane/runtime-bootstrap';

import {
  getControlPlaneRuntimeStore,
} from '@/lib/control-plane/runtime-data';

import {
  OutboxConsumerRegistry,
} from '@/lib/control-plane/consumer';

import {
  GovernedHandoffRouterConsumer,
} from '@/lib/control-plane/handoff-router';

import {
  clearCompanyRuntimeHeartbeat,
  writeCompanyRuntimeHeartbeat,
} from '@/lib/control-plane/company-runtime-heartbeat';

import {
  ReliableOutboxWorker,
} from '@/lib/control-plane/outbox-worker';

function sleep(
  ms: number,
): Promise<void> {
  return new Promise(
    (
      resolve,
    ) => {
      setTimeout(
        resolve,
        ms,
      );
    },
  );
}


function errorMessage(
  error: unknown,
): string {
  return error instanceof Error
    ? error.message
    : String(error);
}


async function main() {
  const envPath =
    path.join(
      process.cwd(),
      '.env.local',
    );


  if (
    existsSync(
      envPath,
    )
  ) {
    loadEnvFile(
      envPath,
    );
  }


  if (
    !process.env
      .OMNIROUTE_API_KEY
      ?.trim()
  ) {
    throw new Error(
      'OMNIROUTE_API_KEY_required',
    );
  }


  const pollIntervalMs =
    Number(
      process.env
        .STARTUP_AGENT_RUNTIME_POLL_MS ??
      2000,
    );


  if (
    !Number.isFinite(
      pollIntervalMs,
    ) ||
    pollIntervalMs < 500
  ) {
    throw new Error(
      'invalid_STARTUP_AGENT_RUNTIME_POLL_MS',
    );
  }



  const runtimeStartedAt =
    new Date()
      .toISOString();


  const writeHeartbeat =
    () => {
      writeCompanyRuntimeHeartbeat({
        processId:
          process.pid,

        startedAt:
          runtimeStartedAt,

        lastHeartbeatAt:
          new Date()
            .toISOString(),

        pollIntervalMs,
      });
    };


  writeHeartbeat();


  let stopping =
    false;


  const requestStop =
    () => {
      stopping =
        true;

      console.log(
        '\nStopping company runtime worker...',
      );
    };


  process.once(
    'SIGINT',
    requestStop,
  );

  process.once(
    'SIGTERM',
    requestStop,
  );


  console.log(
    '\n=== COMPANY AGENT RUNTIME STARTED ===',
  );

  console.log(
    `poll interval: ${pollIntervalMs} ms`,
  );

  console.log(
    'waiting for Control Plane tasks...',
  );

  const runtimeStore =
    getControlPlaneRuntimeStore();

      const outboxRegistry =
    new OutboxConsumerRegistry();


  outboxRegistry.register(
    new GovernedHandoffRouterConsumer(
      runtimeStore,
    ),
  );


  const outboxWorker =
    new ReliableOutboxWorker(
      runtimeStore,
      outboxRegistry,
      {
        workerId:
          'company-outbox-router',

        batchSize:
          20,

        outboxLeaseMs:
          30_000,

        consumerLeaseMs:
          30_000,
      },
    );

    const handoffRegistry =
        buildInternalRuntimeSinkRegistry({
            store:
                runtimeStore,
        });


    const handoffDispatcher =
        new GovernedHandoffDispatcher(
            runtimeStore,
            handoffRegistry,
            {
                workerId:
                    'company-handoff-dispatcher',

                batchSize:
                    20,

                leaseMs:
                    30_000,
            },
        );


  while (
    !stopping
  ) {
    writeHeartbeat();
    try {
      const now =
        new Date().toISOString();


      const outbox =
        await outboxWorker.runOnce(
          now,
        );


      if (
        outbox.claimed >
        0
      ) {
        console.log(
          `outbox: claimed=${outbox.claimed} succeeded=${outbox.succeeded} failed=${outbox.failed}`,
        );
      }


      const handoffs =
        await handoffDispatcher.runOnce(
          now,
        );


      if (
        handoffs.claimed >
        0
      ) {
        console.log(
          `handoffs: claimed=${handoffs.claimed} delivered=${handoffs.delivered} failed=${handoffs.failed}`,
        );
      }

  
      const results =
        await runReadyCompanyAgents();


      if (
        results.length >
        0
      ) {
        console.log(
          '\n=== RUNTIME CYCLE ===',
        );


        for (
          const result
          of results
        ) {
          console.log(
            `${result.agentId}: claimed=${result.claimed} completed=${result.completed} failed=${result.failed}`,
          );
        }
      }
    } catch (
      error
    ) {
      console.error(
        'runtime cycle error:',
        errorMessage(
          error,
        ),
      );
    }


    if (
      !stopping
    ) {
      await sleep(
        pollIntervalMs,
      );
    }
  }

  clearCompanyRuntimeHeartbeat();
  console.log(
    '=== COMPANY AGENT RUNTIME STOPPED ===\n',
  );
}


main()
  .catch(
    (
      error,
    ) => {
      console.error(
        '\nCompany runtime worker failed:',
        errorMessage(
          error,
        ),
      );

      process.exitCode =
        1;
    },
  );