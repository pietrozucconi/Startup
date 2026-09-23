import { z } from 'zod';

import {
  EnvironmentRuntimeSecretSource,
} from '@/lib/control-plane/runtime-secret-source';


const OmniRouteModelSchema =
  z.object({
    id:
      z.string().min(1),

    object:
      z.string().optional(),

    owned_by:
      z.string().optional(),

    type:
      z.string().optional(),
  })
    .passthrough();


const OmniRouteModelListSchema =
  z.object({
    data:
      z.array(
        OmniRouteModelSchema,
      ),
  });


export type OmniRouteSelectableModel = {
  id: string;
  provider: string;
};


const NON_CHAT_MODEL_TYPES =
  new Set([
    'embedding',
    'image',
    'audio',
    'rerank',
    'moderation',
    'video',
    'music',
  ]);


function providerFromModelId(
  modelId:
    string,
): string {
  const slash =
    modelId.indexOf(
      '/',
    );

  return slash > 0
    ? modelId.slice(
        0,
        slash,
      )
    : 'unknown';
}


function isManuallySelectableModel(
  model: z.infer<
    typeof OmniRouteModelSchema
  >,
): boolean {
  const id =
    model.id
      .trim();


  if (
    !id
  ) {
    return false;
  }


  /*
   * Company policy:
   * model selection belongs exclusively to the CEO.
   *
   * OmniRoute auto routes and combos may internally choose
   * between multiple models, so they cannot be assigned
   * to a company employee.
   */
  if (
    /^(?:model:)?auto(?:[/:]|$)/i.test(
      id,
    ) ||
    id.startsWith(
      'combo/',
    ) ||
    id.includes(
      '/combo/',
    )
  ) {
    return false;
  }


  if (
    model.type &&
    NON_CHAT_MODEL_TYPES.has(
      model.type
        .toLowerCase(),
    )
  ) {
    return false;
  }


  return true;
}


export async function listOmniRouteSelectableModels(
  input: {
    env?:
      Readonly<
        Record<
          string,
          string | undefined
        >
      >;

    fetchImpl?:
      typeof fetch;
  } = {},
): Promise<
  OmniRouteSelectableModel[]
> {
  const env =
    input.env ??
    process.env;


  const secretSource =
    new EnvironmentRuntimeSecretSource(
      env,
    );


  const apiKey =
    secretSource
      .getSecret(
        'OMNIROUTE_API_KEY',
      );


  const baseUrl =
    (
      env
        .OMNIROUTE_BASE_URL ??
      'http://localhost:20128/v1'
    )
      .replace(
        /\/+$/,
        '',
      );


  const fetchImpl =
    input.fetchImpl ??
    fetch;


  /*
  * OmniRoute recommends the alias catalog for model pickers.
  *
  * It exposes one selectable id per model and avoids
  * duplicate alias/canonical entries in the UI.
  */


  const response =
    await fetchImpl(
      `${baseUrl}/models?prefix=alias`,
      {
        method:
          'GET',

        headers: {
          authorization:
            `Bearer ${apiKey}`,
        },
      },
    );


  if (
    !response.ok
  ) {
    throw new Error(
      `omniroute_model_catalog_failed:${response.status}`,
    );
  }


  const parsed =
    OmniRouteModelListSchema
      .parse(
        await response.json(),
      );


  const unique =
    new Map<
      string,
      OmniRouteSelectableModel
    >();


  for (
    const model of
    parsed.data
  ) {
    if (
      !isManuallySelectableModel(
        model,
      )
    ) {
      continue;
    }


    const id =
      model.id
        .trim();


    unique.set(
      id,
      {
        id,

        provider:
          providerFromModelId(
            id,
          ),
      },
    );
  }


  return [
    ...unique.values(),
  ]
    .sort(
      (
        a,
        b,
      ) =>
        a.provider.localeCompare(
          b.provider,
        ) ||
        a.id.localeCompare(
          b.id,
        ),
    );
}