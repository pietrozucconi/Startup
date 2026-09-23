import {
  randomUUID,
} from 'node:crypto';

import {
  getControlPlaneRuntimeStore,
} from '@/lib/control-plane/runtime-data';


const store =
  getControlPlaneRuntimeStore();

const now =
  new Date().toISOString();

const id =
  randomUUID();


const task =
  store.upsertAgentRuntimeTask({
    taskId:
      `runtime-smoke:${id}`,

    handoffId:
      `runtime-smoke-handoff:${id}`,

    agentId:
      'lauti',

    action:
      'runtime_smoke_test',

    summary:
      'Live runtime smoke test. Return a concise completion summary. Do not register artifacts, request workflow transitions, or create invalidations.',

    priority:
      'normal',

    status:
      'queued',

    attempts:
      0,

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
        1000,

      backoffMultiplier:
        2,

      maxDelayMs:
        1000,

      timeoutMs:
        120000,
    },

    policyEvidence: [
      'manual-runtime-smoke-test',
      'financial-execution:forbidden',
    ],

    payload: {
      smokeTest:
        true,
    },

    result:
      {},
  });


console.log(
  `queued: ${task.taskId}`,
);

console.log(
  `agent: ${task.agentId}`,
);

console.log(
  `status: ${task.status}`,
);