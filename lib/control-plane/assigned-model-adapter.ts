import type {
  AgentModelAdapter,
  AgentModelExecutionResultInput,
} from '@/lib/control-plane/agent-model-adapter';

import {
  OmniRouteModelAdapter,
} from '@/lib/control-plane/omniroute-model-adapter';

import type {
  RuntimeSecretSource,
} from '@/lib/control-plane/runtime-secret-source';


export type AssignedModelResolver =
  (
    agentId:
      string,
  ) => string | null;


function assertManualExactModel(
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


export class AssignedOmniRouteModelAdapter
  implements AgentModelAdapter
{
  readonly id =
    'assigned-omniroute-model';


  constructor(
    private readonly input: {
      resolveAssignedModel:
        AssignedModelResolver;

      secretSource:
        RuntimeSecretSource;

      baseUrl?:
        string;

      fetchImpl?:
        typeof fetch;

      clock?:
        () => string;
    },
  ) {}


  async execute(
    input:
      Parameters<
        AgentModelAdapter['execute']
      >[0],
  ): Promise<
    AgentModelExecutionResultInput
  > {
    /*
     * Read ONCE at the beginning of the execution.
     *
     * From this point onwards this exact model is pinned
     * for the entire task execution.
     */
    const rawModel =
      this.input
        .resolveAssignedModel(
          input.execution
            .profile
            .agentId,
        );


    const assignedModel =
      rawModel
        ?.trim() ??
      '';


    if (
      !assignedModel ||
      assignedModel ===
        'unassigned'
    ) {
      throw new Error(
        `agent_model_not_assigned:${input.execution.profile.agentId}`,
      );
    }


    assertManualExactModel(
      assignedModel,
    );


    const pinnedAt =
      (
        this.input.clock ??
        (() =>
          new Date()
            .toISOString())
      )();


    /*
     * A new exact adapter is created from the model
     * resolved above.
     *
     * We deliberately do NOT re-read the assignment
     * during this execution.
     */
    const pinnedAdapter =
      new OmniRouteModelAdapter({
        secretSource:
          this.input
            .secretSource,

        model:
          assignedModel,

        baseUrl:
          this.input
            .baseUrl,

        fetchImpl:
          this.input
            .fetchImpl,
      });


    const result =
      await pinnedAdapter
        .execute(
          input,
        );


    return {
      ...result,

      metadata: {
        ...(result.metadata ??
          {}),

        modelAssignment: {
          mode:
            'manual',

          agentId:
            input.execution
              .profile
              .agentId,

          pinnedModel:
            assignedModel,

          pinnedAt,

          automaticFallback:
            false,
        },
      },
    };
  }
}