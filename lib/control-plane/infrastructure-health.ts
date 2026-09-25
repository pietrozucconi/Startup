import {
  buildControlPlaneOperatorSnapshot,
} from '@/lib/control-plane/operator-view';

import {
  getControlPlaneRuntimeStore,
} from '@/lib/control-plane/runtime-data';

import {
  readCompanyRuntimeHeartbeat,
} from '@/lib/control-plane/company-runtime-heartbeat';

import {
  listOmniRouteSelectableModels,
} from '@/lib/control-plane/omniroute-model-catalog';


export type InfrastructureStatus =
  | 'connected'
  | 'degraded'
  | 'offline';


export type InfrastructureServiceHealth = {
  status: InfrastructureStatus;

  reason?: string;

  metadata?: Record<
    string,
    unknown
  >;
};


export type InfrastructureHealthSnapshot = {
  checkedAt: string;

  overall:
    InfrastructureStatus;

  cognee:
    InfrastructureServiceHealth;

  omniroute:
    InfrastructureServiceHealth;

  companyRuntime:
    InfrastructureServiceHealth;

  controlPlane:
    InfrastructureServiceHealth;
};


type HealthOptions = {
  env?: Readonly<
    Record<
      string,
      string | undefined
    >
  >;

  fetchImpl?: typeof fetch;

  now?: string;

  heartbeatPath?: string;
};


async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  input: Parameters<
    typeof fetch
  >[0],
  init?: RequestInit,
  timeoutMs = 5000,
): Promise<Response> {
  const controller =
    new AbortController();


  const timeout =
    setTimeout(
      () => {
        controller.abort();
      },
      timeoutMs,
    );


  try {
    return await fetchImpl(
      input,
      {
        ...init,

        signal:
          controller.signal,
      },
    );
  } finally {
    clearTimeout(
      timeout,
    );
  }
}


async function checkCognee(
  env: Readonly<
    Record<
      string,
      string | undefined
    >
  >,
  fetchImpl: typeof fetch,
): Promise<
  InfrastructureServiceHealth
> {
  if (
    env
      .STARTUP_BRAIN_RUNTIME_MODE
      ?.trim()
      .toLowerCase() !==
    'cognee'
  ) {
    return {
      status:
        'degraded',

      reason:
        'brain_runtime_not_using_cognee',
    };
  }


  const email =
    env
      .COGNEE_API_EMAIL
      ?.trim();

  const password =
    env
      .COGNEE_API_PASSWORD
      ?.trim();

  const dataset =
    env
      .COGNEE_DATASET
      ?.trim();

  const baseUrl =
    (
      env
        .COGNEE_BASE_URL ??
      'http://127.0.0.1:8000'
    )
      .replace(
        /\/+$/,
        '',
      );


  if (
    !email ||
    !password ||
    !dataset
  ) {
    return {
      status:
        'degraded',

      reason:
        'cognee_configuration_incomplete',
    };
  }


  try {
    const loginResponse =
      await fetchWithTimeout(
        fetchImpl,
        `${baseUrl}/api/v1/auth/login`,
        {
          method:
            'POST',

          headers: {
            'content-type':
              'application/x-www-form-urlencoded',
          },

          body:
            new URLSearchParams({
              username:
                email,

              password,
            }),
        },
      );


    if (
      !loginResponse.ok
    ) {
      return {
        status:
          'degraded',

        reason:
          'cognee_authentication_failed',
      };
    }


    const loginBody =
      await loginResponse.json() as {
        access_token?: unknown;
      };


    const token =
      typeof loginBody
        .access_token ===
        'string'
        ? loginBody
            .access_token
            .trim()
        : '';


    if (
      !token
    ) {
      return {
        status:
          'degraded',

        reason:
          'cognee_token_missing',
      };
    }


    const datasetsResponse =
      await fetchWithTimeout(
        fetchImpl,
        `${baseUrl}/api/v1/datasets`,
        {
          method:
            'GET',

          headers: {
            authorization:
              `Bearer ${token}`,
          },
        },
      );


    if (
      !datasetsResponse.ok
    ) {
      return {
        status:
          'degraded',

        reason:
          'cognee_authenticated_request_failed',
      };
    }


    return {
      status:
        'connected',

      metadata: {
        dataset,
        authenticated:
          true,
      },
    };
  } catch {
    return {
      status:
        'offline',

      reason:
        'cognee_unreachable',
    };
  }
}


async function checkOmniRoute(
  env: Readonly<
    Record<
      string,
      string | undefined
    >
  >,
  fetchImpl: typeof fetch,
): Promise<
  InfrastructureServiceHealth
> {
  if (
    !env
      .OMNIROUTE_API_KEY
      ?.trim()
  ) {
    return {
      status:
        'degraded',

      reason:
        'omniroute_configuration_incomplete',
    };
  }


  try {
    const boundedFetch =
      ((
        input:
          Parameters<
            typeof fetch
          >[0],

        init?:
          RequestInit,
      ) =>
        fetchWithTimeout(
          fetchImpl,
          input,
          init,
        )) as typeof fetch;


    const models =
      await listOmniRouteSelectableModels({
        env,

        fetchImpl:
          boundedFetch,
      });


    return {
      status:
        'connected',

      metadata: {
        selectableModels:
          models.length,
      },
    };
  } catch {
    return {
      status:
        'offline',

      reason:
        'omniroute_unreachable',
    };
  }
}


function checkCompanyRuntime(
  now: string,
  heartbeatPath?: string,
): InfrastructureServiceHealth {
  const heartbeat =
    heartbeatPath
      ? readCompanyRuntimeHeartbeat(
          heartbeatPath,
        )
      : readCompanyRuntimeHeartbeat();


  if (
    !heartbeat
  ) {
    return {
      status:
        'offline',

      reason:
        'runtime_heartbeat_missing',
    };
  }


  const ageMs =
    Math.max(
      0,

      Date.parse(
        now,
      ) -
        Date.parse(
          heartbeat
            .lastHeartbeatAt,
        ),
    );


  const healthyThresholdMs =
    Math.max(
      heartbeat
        .pollIntervalMs *
        3,

      10_000,
    );


  const offlineThresholdMs =
    Math.max(
      heartbeat
        .pollIntervalMs *
        10,

      30_000,
    );


  if (
    ageMs <=
    healthyThresholdMs
  ) {
    return {
      status:
        'connected',

      metadata: {
        processId:
          heartbeat.processId,

        startedAt:
          heartbeat.startedAt,

        lastHeartbeatAt:
          heartbeat
            .lastHeartbeatAt,

        ageMs,
      },
    };
  }


  if (
    ageMs <=
    offlineThresholdMs
  ) {
    return {
      status:
        'degraded',

      reason:
        'runtime_heartbeat_stale',

      metadata: {
        processId:
          heartbeat.processId,

        lastHeartbeatAt:
          heartbeat
            .lastHeartbeatAt,

        ageMs,
      },
    };
  }


  return {
    status:
      'offline',

    reason:
      'runtime_heartbeat_expired',

    metadata: {
      processId:
        heartbeat.processId,

      lastHeartbeatAt:
        heartbeat
          .lastHeartbeatAt,

      ageMs,
    },
  };
}


async function checkControlPlane():
  Promise<
    InfrastructureServiceHealth
  > {
  try {
    const store =
      getControlPlaneRuntimeStore();


    const snapshot =
      await buildControlPlaneOperatorSnapshot(
        store,
      );


    const deadLetters =
      snapshot.counts
        .taskDeadLetters +
      snapshot.counts
        .handoffDeadLetters +
      snapshot.counts
        .outboxDeadLetters +
      snapshot.counts
        .jobDeadLetters;


    return {
      status:
        deadLetters > 0
          ? 'degraded'
          : 'connected',

      reason:
        deadLetters > 0
          ? 'control_plane_dead_letters_present'
          : undefined,

      metadata: {
        workflows:
          snapshot.counts
            .workflows,

        openTasks:
          snapshot.counts
            .openTasks,

        pendingHandoffs:
          snapshot.counts
            .pendingHandoffs,

        deadLetters,
      },
    };
  } catch {
    return {
      status:
        'offline',

      reason:
        'control_plane_unavailable',
    };
  }
}


export async function buildInfrastructureHealthSnapshot(
  options:
    HealthOptions =
      {},
): Promise<
  InfrastructureHealthSnapshot
> {
  const env =
    options.env ??
    process.env;


  const fetchImpl =
    options.fetchImpl ??
    fetch;


  const checkedAt =
    options.now ??
    new Date()
      .toISOString();


  const [
    cognee,
    omniroute,
    controlPlane,
  ] =
    await Promise.all([
      checkCognee(
        env,
        fetchImpl,
      ),

      checkOmniRoute(
        env,
        fetchImpl,
      ),

      checkControlPlane(),
    ]);


  const companyRuntime =
    checkCompanyRuntime(
      checkedAt,
      options
        .heartbeatPath,
    );


  const statuses = [
    cognee.status,
    omniroute.status,
    companyRuntime.status,
    controlPlane.status,
  ];


  const overall:
    InfrastructureStatus =
      statuses.every(
        (
          status,
        ) =>
          status ===
          'connected',
      )
        ? 'connected'
        : statuses.every(
            (
              status,
            ) =>
              status ===
              'offline',
          )
          ? 'offline'
          : 'degraded';


  return {
    checkedAt,

    overall,

    cognee,

    omniroute,

    companyRuntime,

    controlPlane,
  };
}