import {
  randomUUID,
} from 'node:crypto';

import type {
  FounderDb,
} from '@/lib/db';

import type {
  ControlPlanePrincipal,
} from '@/lib/control-plane/schema';

import {
  listOmniRouteSelectableModels,
} from '@/lib/control-plane/omniroute-model-catalog';


function isCeo(
  principal:
    ControlPlanePrincipal,
): boolean {
  return (
    principal.actor.kind ===
      'human' &&
    principal.actor.id ===
      'ceo'
  );
}


function assertExactModelAssignment(
  model:
    string,
): void {
  if (
    /^(?:model:)?auto(?:[/:]|$)/i.test(
      model,
    ) ||
    model.startsWith(
      'combo/',
    ) ||
    model.includes(
      '/combo/',
    )
  ) {
    throw new Error(
      'automatic_model_routing_forbidden',
    );
  }
}


export async function assignAgentModel(
  input: {
    db:
      FounderDb;

    principal:
      ControlPlanePrincipal;

    agentId:
      string;

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

    clock?:
      () => string;

    idFactory?:
      () => string;
  },
) {
  if (
    !isCeo(
      input.principal,
    )
  ) {
    throw new Error(
      'ceo_required_for_model_assignment',
    );
  }


  const agent =
    input.db
      .agents
      .byId(
        input.agentId,
      );


  if (
    !agent
  ) {
    throw new Error(
      `agent_not_found:${input.agentId}`,
    );
  }


  const model =
    input.model
      .trim();


  if (
    !model
  ) {
    throw new Error(
      'agent_model_assignment_required',
    );
  }


  assertExactModelAssignment(
    model,
  );


  const selectableModels =
    await listOmniRouteSelectableModels({
      env:
        input.env,

      fetchImpl:
        input.fetchImpl,
    });


  const exists =
    selectableModels
      .some(
        (
          candidate,
        ) =>
          candidate.id ===
          model,
      );


  if (
    !exists
  ) {
    throw new Error(
      `agent_model_not_selectable:${model}`,
    );
  }


  if (
    agent.model ===
    model
  ) {
    return {
      changed:
        false as const,

      agent,

      assignment:
        null,
    };
  }


  const clock =
    input.clock ??
    (() =>
      new Date()
        .toISOString());


  const idFactory =
    input.idFactory ??
    randomUUID;


  const assignment =
    input.db
      .agentModelAssignments
      .assign({
        id:
          `agent-model-assignment:${idFactory()}`,

        agentId:
          agent.id,

        previousModel:
          agent.model,

        assignedModel:
          model,

        assignedBy:
          'ceo',

        assignedAt:
          clock(),
      });


  const updatedAgent =
    input.db
      .agents
      .byId(
        agent.id,
      );


  if (
    !updatedAgent
  ) {
    throw new Error(
      `agent_not_found_after_model_assignment:${agent.id}`,
    );
  }


  return {
    changed:
      true as const,

    agent:
      updatedAgent,

    assignment,
  };
}