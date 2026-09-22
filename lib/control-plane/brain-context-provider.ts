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

    const result =
      await this.gateway.read({
        requestId:
          input.requestId,

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
          `Retrieve only relevant institutional memory for runtime task ${input.task.taskId}.`,

        query: {
          text: queryText,
          departmentIds: [
            input.profile.departmentId,
          ],
          agentIds: [
            input.profile.agentId,
          ],
          assetIds,
          maxHops:
            input.profile.brain
              .maxHops,
          limit:
            input.profile.brain
              .maxResults,
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
            input.profile.brain
              .maxResults,
          maxHops:
            input.profile.brain
              .maxHops,
          maxContentCharsPerNode:
            input.profile.brain
              .maxContentCharsPerNode,
          maxTotalContentChars:
            input.profile.brain
              .maxTotalContentChars,
          includeContent: true,
          includeMetadata: true,
        },

        requestedNodeTypes: [],
      });

    return {
      route:
        result.route,
      results:
        result.results,
      truncated:
        result.truncated,
      totalContentChars:
        result.totalContentChars,
    };
  }
}
