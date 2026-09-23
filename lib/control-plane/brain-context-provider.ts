import type {
  BrainGateway,
} from '@/lib/brain/gateway/gateway';

import type {
  BudgetedRetrievalResult,
} from '@/lib/brain/gateway/budget';

import type {
  BrainRouteDecision,
} from '@/lib/brain/gateway/schema';

import type {
  InvestmentWorkflow,
} from '@/lib/control-plane/schema';

import type {
  AgentRuntimeTask,
} from '@/lib/control-plane/runtime-schema';

import type {
  CompanyAgentRuntimeProfile,
} from '@/lib/control-plane/agent-runtime-profile';

export type AgentBrainContext = {
  route: BrainRouteDecision | null;
  results: BudgetedRetrievalResult[];
  truncated: boolean;
  totalContentChars: number;
};

export interface AgentBrainContextProvider {
  retrieve(input: {
    profile:
      CompanyAgentRuntimeProfile;
    task:
      AgentRuntimeTask;
    workflow:
      InvestmentWorkflow | null;
    requestId: string;
  }): Promise<AgentBrainContext>;
}

export class EmptyAgentBrainContextProvider
  implements AgentBrainContextProvider
{
  async retrieve(): Promise<AgentBrainContext> {
    return {
      route: null,
      results: [],
      truncated: false,
      totalContentChars: 0,
    };
  }
}

/**
 * Startup Brain access for runtime employees always goes through BrainGateway.
 * The employee is issued only read/retrieve capabilities; it does not receive
 * graph-store access and cannot commit Brain mutations from this path.
 */
export class BrainGatewayAgentContextProvider
  implements AgentBrainContextProvider
{
  constructor(
    private readonly gateway:
      Pick<BrainGateway, 'read'>,
  ) {}

  async retrieve(input: {
    profile:
      CompanyAgentRuntimeProfile;
    task:
      AgentRuntimeTask;
    workflow:
      InvestmentWorkflow | null;
    requestId: string;
  }): Promise<AgentBrainContext> {
    if (
      !input.profile.brain.enabled
    ) {
      return {
        route: null,
        results: [],
        truncated: false,
        totalContentChars: 0,
      };
    }

    const assetIds =
      input.workflow?.assetRef
        ? [input.workflow.assetRef]
        : [];

    const queryText = [
      input.task.action,
      input.task.summary,
      input.workflow?.assetRef ??
        '',
    ]
      .filter(Boolean)
      .join(' ');

    let requestedLimit =
      Math.min(
        input.profile.brain
          .initialResults,
        input.profile.brain
          .technicalMaxResults,
      );

    let requestedHops =
      Math.min(
        input.profile.brain
          .initialHops,
        input.profile.brain
          .technicalMaxHops,
      );

    const seenNodeIds =
      new Set<string>();

    let finalResult:
      Awaited<
        ReturnType<
          Pick<
            BrainGateway,
            'read'
          >['read']
        >
      > |
      null =
      null;

    let stoppedByTechnicalCeiling =
      false;


    while (true) {
      const result =
        await this.gateway.read({
          requestId:
            `${input.requestId}:brain:${requestedLimit}:${requestedHops}`,

          principal: {
            actor: {
              kind: 'agent',
              id:
                input.profile.agentId,
            },
            departmentIds: [
              input.profile.departmentId,
            ],
            capabilities: [
              'brain.read',
              'brain.retrieve',
            ],
            issuedBy:
              'company-control-plane',
          },

          intent:
            'institutional_memory',

          purpose:
            `Retrieve relevant institutional memory for runtime task ${input.task.taskId} using progressive semantic and graph expansion.`,

          query: {
            text:
              queryText,

            seedNodeIds: [
              'startup-brain',
              input.profile.departmentId,
              input.profile.agentId,
            ],

            maxHops:
              requestedHops,

            limit:
              requestedLimit,
          },

          context: {
            departmentIds: [
              input.profile.departmentId,
            ],
            agentIds: [
              input.profile.agentId,
            ],
            assetIds,
            workflowIds:
              input.task.workflowId
                ? [
                    input.task
                      .workflowId,
                  ]
                : [],
            taskIds: [
              input.task.taskId,
            ],
            tags: [
              'agent-runtime',
            ],
          },

          budget: {
            maxResults:
              requestedLimit,

            maxHops:
              requestedHops,

            maxContentCharsPerNode:
              input.profile.brain
                .technicalMaxContentCharsPerNode,

            maxTotalContentChars:
              input.profile.brain
                .technicalMaxTotalContentChars,

            includeContent:
              true,

            includeMetadata:
              true,
          },

          requestedNodeTypes:
            [],
        });


      finalResult =
        result;


      let newNodeCount =
        0;


      for (
        const item
        of result.results
      ) {
        if (
          !seenNodeIds.has(
            item.node.id,
          )
        ) {
          seenNodeIds.add(
            item.node.id,
          );

          newNodeCount +=
            1;
        }
      }


      if (
        newNodeCount ===
        0
      ) {
        break;
      }


      const atResultCeiling =
        requestedLimit >=
        input.profile.brain
          .technicalMaxResults;


      const atHopCeiling =
        requestedHops >=
        input.profile.brain
          .technicalMaxHops;


      if (
        atResultCeiling &&
        atHopCeiling
      ) {
        stoppedByTechnicalCeiling =
          result.truncated ||
          result.results.length >=
            requestedLimit;

        break;
      }


      if (
        result.results.length <
          requestedLimit &&
        atHopCeiling
      ) {
        break;
      }


      const nextLimit =
        result.results.length >=
          requestedLimit
          ? Math.min(
              input.profile.brain
                .technicalMaxResults,

              requestedLimit +
                input.profile.brain
                  .expansionStep,
            )
          : requestedLimit;


      const nextHops =
        Math.min(
          input.profile.brain
            .technicalMaxHops,

          requestedHops +
            1,
        );


      if (
        nextLimit ===
          requestedLimit &&
        nextHops ===
          requestedHops
      ) {
        stoppedByTechnicalCeiling =
          true;

        break;
      }


      requestedLimit =
        nextLimit;

      requestedHops =
        nextHops;
    }


    if (
      !finalResult
    ) {
      return {
        route:
          null,

        results:
          [],

        truncated:
          false,

        totalContentChars:
          0,
      };
    }


    return {
      route:
        finalResult.route,

      results:
        finalResult.results,

      truncated:
        finalResult.truncated ||
        stoppedByTechnicalCeiling,

      totalContentChars:
        finalResult.totalContentChars,
    };
  }
}

