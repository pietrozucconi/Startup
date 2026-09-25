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
  BrainGatewayAgentContextProvider,
  EmptyAgentBrainContextProvider,
  type AgentBrainContextProvider,
} from '@/lib/control-plane/brain-context-provider';

import {
  EnvironmentRuntimeSecretSource,
} from '@/lib/control-plane/runtime-secret-source';


type StartupBrainRuntimeMode =
  | 'disabled'
  | 'cognee';


let cachedProvider:
  AgentBrainContextProvider |
  null =
  null;


function runtimeMode(
  env:
    Readonly<
      Record<
        string,
        string | undefined
      >
    >,
): StartupBrainRuntimeMode {
  const raw =
    env
      .STARTUP_BRAIN_RUNTIME_MODE
      ?.trim()
      .toLowerCase();


  if (
    !raw ||
    raw ===
      'disabled'
  ) {
    return 'disabled';
  }


  if (
    raw ===
      'cognee'
  ) {
    return 'cognee';
  }


  throw new Error(
    `invalid_STARTUP_BRAIN_RUNTIME_MODE:${raw}`,
  );
}


export function getStartupBrainContextProvider(
  env:
    Readonly<
      Record<
        string,
        string | undefined
      >
    > =
      process.env,
): AgentBrainContextProvider {
  if (
    cachedProvider
  ) {
    return cachedProvider;
  }


  const mode =
    runtimeMode(
      env,
    );


  if (
    mode ===
    'disabled'
  ) {
    cachedProvider =
      new EmptyAgentBrainContextProvider();

    return cachedProvider;
  }


  const baseUrl =
    env
      .COGNEE_BASE_URL
      ?.trim() ??
    'http://127.0.0.1:8000';


  const email =
    env
      .COGNEE_API_EMAIL
      ?.trim();


  const dataset =
    env
      .COGNEE_DATASET
      ?.trim();


  if (
    !email
  ) {
    throw new Error(
      'COGNEE_API_EMAIL_required',
    );
  }


  if (
    !dataset
  ) {
    throw new Error(
      'COGNEE_DATASET_required',
    );
  }


  const secretSource =
    new EnvironmentRuntimeSecretSource(
      env,
    );


  const cogneeClient =
    new CogneeRecallClient({
      baseUrl,

      email,

      passwordSecretName:
        'COGNEE_API_PASSWORD',

      secretSource,
    });


  const retrievalBackend =
    new CogneeBrainRetrievalBackend({
      client:
        cogneeClient,

      dataset,

      /*
       * Temporary V2K.2 smoke scope.
       *
       * Production Cognee memories will
       * carry their own governed scope.
       */
      readableByAgentIds: [
        'lauti',
      ],
    });


  const graphStore =
    new InMemoryBrainGraphStore(
      createEmptyBrainGraph(
        'startup-brain-runtime',
        new Date()
          .toISOString(),
      ),
    );


  const auditStore =
    new InMemoryBrainAuditStore();


  const gateway =
    new BrainGateway(
      graphStore,
      auditStore,
      undefined,
      retrievalBackend,
    );


  cachedProvider =
    new BrainGatewayAgentContextProvider(
      gateway,
    );


  return cachedProvider;
}


export function resetStartupBrainRuntimeForTests():
  void {
  cachedProvider =
    null;
}