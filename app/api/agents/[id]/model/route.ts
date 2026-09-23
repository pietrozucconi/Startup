import {
  NextResponse,
} from 'next/server';

import {
  getDb,
} from '@/lib/data';

import {
  assignAgentModel,
} from '@/lib/control-plane/agent-model-assignment';


export const dynamic =
  'force-dynamic';

export const runtime =
  'nodejs';


function errorStatus(
  message:
    string,
): number {
  if (
    message.startsWith(
      'agent_not_found:',
    )
  ) {
    return 404;
  }


  if (
    message ===
      'agent_model_assignment_required' ||
    message ===
      'automatic_model_routing_forbidden' ||
    message.startsWith(
      'agent_model_not_selectable:',
    )
  ) {
    return 400;
  }


  if (
    message.startsWith(
      'agent_model_assignment_conflict:',
    )
  ) {
    return 409;
  }


  if (
    message.startsWith(
      'runtime_secret_missing:',
    ) ||
    message.startsWith(
      'omniroute_model_catalog_failed:',
    )
  ) {
    return 502;
  }


  return 500;
}


export async function POST(
  req:
    Request,

  {
    params,
  }: {
    params: {
      id:
        string;
    };
  },
) {
  let body:
    unknown;


  try {
    body =
      await req.json();
  } catch {
    return NextResponse.json(
      {
        ok:
          false,

        error:
          'invalid_json_body',
      },
      {
        status:
          400,
      },
    );
  }


  if (
    !body ||
    typeof body !==
      'object' ||
    Array.isArray(
      body,
    )
  ) {
    return NextResponse.json(
      {
        ok:
          false,

        error:
          'invalid_request_body',
      },
      {
        status:
          400,
      },
    );
  }


  const model =
    (
      body as {
        model?:
          unknown;
      }
    )
      .model;


  if (
    typeof model !==
      'string' ||
    !model.trim() ||
    model.length >
      200
  ) {
    return NextResponse.json(
      {
        ok:
          false,

        error:
          'agent_model_assignment_required',
      },
      {
        status:
          400,
      },
    );
  }


  try {
    /*
     * This route belongs to the human operator surface.
     *
     * The current application has one human authority:
     * the CEO behind the whole-app access gate.
     *
     * Agents do not receive this route as a runtime capability.
     */
    const result =
      await assignAgentModel({
        db:
          getDb(),

        principal: {
          actor: {
            kind:
              'human',

            id:
              'ceo',
          },
        },

        agentId:
          params.id,

        model:
          model.trim(),
      });


    return NextResponse.json({
      ok:
        true,

      changed:
        result.changed,

      agent: {
        id:
          result.agent.id,

        model:
          result.agent.model,
      },

      assignment:
        result.assignment,
    });
  } catch (
    error
  ) {
    const message =
      error instanceof
        Error
        ? error.message
        : String(
            error,
          );


    return NextResponse.json(
      {
        ok:
          false,

        error:
          message,
      },
      {
        status:
          errorStatus(
            message,
          ),
      },
    );
  }
}