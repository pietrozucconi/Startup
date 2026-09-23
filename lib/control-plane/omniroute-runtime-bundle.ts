import {
  AgentReadToolRegistry,
} from '@/lib/control-plane/agent-tool-runtime';

import {
  OmniRouteModelAdapter,
} from '@/lib/control-plane/omniroute-model-adapter';

import {
  EnvironmentRuntimeSecretSource,
} from '@/lib/control-plane/runtime-secret-source';


export function buildOmniRouteRuntimeBundle(
  input: {
    model:
      string;

    env?:
      Readonly<
        Record<
          string,
          string | undefined
        >
      >;

    fetchImpl?:
      typeof fetch;
  },
) {
  const model =
    input.model
      .trim();


  if (
    !model
  ) {
    throw new Error(
      'omniroute_runtime_model_assignment_required',
    );
  }


  const env =
    input.env ??
    process.env;


  const secretSource =
    new EnvironmentRuntimeSecretSource(
      env,
    );


  const toolRegistry =
    new AgentReadToolRegistry();


  const modelAdapter =
    new OmniRouteModelAdapter({
      secretSource,

      model,

      baseUrl:
        env
          .OMNIROUTE_BASE_URL,

      fetchImpl:
        input.fetchImpl,
    });


  return {
    model,
    secretSource,
    toolRegistry,
    modelAdapter,
  };
}