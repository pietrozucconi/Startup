import {
  randomUUID,
} from 'node:crypto';

import {
  AtomicCompanyControlPlane,
} from '@/lib/control-plane/atomic-engine';

import {
  getControlPlaneRuntimeStore,
} from '@/lib/control-plane/runtime-data';


async function main() {
  const store =
    getControlPlaneRuntimeStore();

  const controlPlane =
    new AtomicCompanyControlPlane(
      store,
    );

  const id =
    randomUUID();

  const workflowId =
    `runtime-pipeline-smoke:${id}`;

  const principal = {
    actor: {
      kind:
        'agent' as const,

      id:
        'lauti',
    },
  };


  await controlPlane.createWorkflow({
    requestId:
      `runtime-pipeline-create:${id}`,

    workflowId,

    principal,

    responsibleResearchAgentId:
      'lauti',

    assetRef:
      'AAPL',

    reason:
      'Create full runtime pipeline smoke-test workflow.',

    metadata: {
      smokeTest:
        true,
    },
  });


  await controlPlane.transition({
    requestId:
      `runtime-pipeline-transition:${id}`,

    workflowId,

    principal,

    fromState:
      'DRAFT',

    toState:
      'RESEARCHING',

    expectedRevision:
      0,

    reason:
      'Begin full runtime pipeline smoke test.',
  });


  console.log(
    `workflow: ${workflowId}`,
  );

  console.log(
    'transition: DRAFT -> RESEARCHING',
  );

  console.log(
    'outbox event created by Control Plane',
  );
}


main()
  .catch(
    (
      error,
    ) => {
      console.error(
        error instanceof Error
          ? error.message
          : String(error),
      );

      process.exitCode =
        1;
    },
  );