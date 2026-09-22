import {
  GovernedHandoffSinkRegistry,
  type GovernedHandoffDeliveryContext,
  type GovernedHandoffSink,
} from '@/lib/control-plane/handoff-dispatcher';

import type {
  InternalRuntimeStore,
} from '@/lib/control-plane/runtime-store';

import {
  MONITORING_AGENT_IDS,
  RESEARCH_AGENT_IDS,
  RISK_AGENT_IDS,
} from '@/lib/control-plane/spec';

const ALL_AGENT_IDS = [
  ...RESEARCH_AGENT_IDS,
  ...RISK_AGENT_IDS,
  ...MONITORING_AGENT_IDS,
] as const;

export type CompanyAgentId =
  (typeof ALL_AGENT_IDS)[number];

const ALL_AGENT_ID_SET =
  new Set<string>(
    ALL_AGENT_IDS,
  );

const DEFAULT_AGENT_TASK_RETRY_POLICY = {
  maxAttempts: 3,
  initialDelayMs: 1_000,
  backoffMultiplier: 2,
  maxDelayMs: 60_000,
  timeoutMs: 120_000,
} as const;

function taskPriority(
  context: GovernedHandoffDeliveryContext,
) {
  if (
    context.handoff.action.includes(
      'material_invalidation',
    )
  ) {
    return 'high' as const;
  }

  return 'normal' as const;
}

export class AgentTaskRuntimeHandoffSink
  implements GovernedHandoffSink
{
  readonly id: string;

  readonly destination: {
    kind: 'agent';
    id: string;
  };

  constructor(
    private readonly store:
      InternalRuntimeStore,
    agentId: string,
  ) {
    if (
      !ALL_AGENT_ID_SET.has(
        agentId,
      )
    ) {
      throw new Error(
        `unknown_company_agent:${agentId}`,
      );
    }

    this.id =
      `agent-task-runtime:${agentId}`;

    this.destination = {
      kind: 'agent',
      id: agentId,
    };
  }

  async deliver(
    context: GovernedHandoffDeliveryContext,
  ) {
    if (
      context.handoff.kind !==
        'agent_task' &&
      context.handoff.kind !==
        'monitoring_task'
    ) {
      throw new Error(
        `agent_runtime_invalid_handoff_kind:${context.handoff.kind}`,
      );
    }

    const now =
      new Date().toISOString();

    const task =
      this.store.upsertAgentRuntimeTask({
        taskId:
          `runtime-task:${context.handoff.handoffId}`,
        handoffId:
          context.handoff.handoffId,
        workflowId:
          context.handoff.workflowId,

        agentId:
          context.handoff.destination.id,

        action:
          context.handoff.action,

        summary:
          context.handoff.summary,

        stateAtAssignment:
          context.handoff.stateAtEvent,

        priority:
          taskPriority(context),

        createdAt:
          context.handoff.createdAt,

        availableAt:
          context.handoff.availableAt,

        updatedAt: now,

        retryPolicy:
          DEFAULT_AGENT_TASK_RETRY_POLICY,

        policyEvidence:
          context.handoff.policyEvidence,

        payload: {
          ...context.handoff.payload,
          handoffId:
            context.handoff.handoffId,
          handoffIdempotencyKey:
            context.idempotencyKey,
        },
      });

    return {
      result: {
        runtimeTaskId:
          task.taskId,
        agentId:
          task.agentId,
        status:
          task.status,
      },
    };
  }
}

export class CeoInboxHandoffSink
  implements GovernedHandoffSink
{
  readonly id =
    'ceo-inbox-runtime';

  readonly destination = {
    kind: 'human',
    id: 'ceo',
  } as const;

  constructor(
    private readonly store:
      InternalRuntimeStore,
  ) {}

  async deliver(
    context: GovernedHandoffDeliveryContext,
  ) {
    let category:
      | 'approval_request'
      | 'notification'
      | 'security_alert';

    switch (context.handoff.kind) {
      case 'ceo_approval_request':
        category =
          'approval_request';
        break;

      case 'ceo_notification':
        category =
          'notification';
        break;

      case 'security_alert':
        category =
          'security_alert';
        break;

      default:
        throw new Error(
          `ceo_inbox_invalid_handoff_kind:${context.handoff.kind}`,
        );
    }

    const item =
      this.store.upsertCeoInboxItem({
        inboxId:
          `ceo-inbox:${context.handoff.handoffId}`,
        handoffId:
          context.handoff.handoffId,
        workflowId:
          context.handoff.workflowId,

        category,

        action:
          context.handoff.action,

        summary:
          context.handoff.summary,

        stateAtCreation:
          context.handoff.stateAtEvent,

        createdAt:
          context.handoff.createdAt,

        updatedAt:
          context.handoff.createdAt,

        policyEvidence:
          context.handoff.policyEvidence,

        payload: {
          ...context.handoff.payload,
          handoffIdempotencyKey:
            context.idempotencyKey,
          resolutionRule:
            'submit_decision_through_control_plane_then_mark_resolved',
        },
      });

    return {
      result: {
        inboxId:
          item.inboxId,
        category:
          item.category,
        status:
          item.status,
      },
    };
  }
}

export function registerCompanyAgentRuntimeSinks(
  registry:
    GovernedHandoffSinkRegistry,
  store:
    InternalRuntimeStore,
): void {
  for (const agentId of ALL_AGENT_IDS) {
    registry.register(
      new AgentTaskRuntimeHandoffSink(
        store,
        agentId,
      ),
    );
  }
}

export function registerCeoInboxRuntimeSink(
  registry:
    GovernedHandoffSinkRegistry,
  store:
    InternalRuntimeStore,
): void {
  registry.register(
    new CeoInboxHandoffSink(
      store,
    ),
  );
}

export function registerCoreInternalRuntimeSinks(
  registry:
    GovernedHandoffSinkRegistry,
  store:
    InternalRuntimeStore,
): void {
  registerCompanyAgentRuntimeSinks(
    registry,
    store,
  );

  registerCeoInboxRuntimeSink(
    registry,
    store,
  );
}

export function companyAgentIds():
  readonly CompanyAgentId[] {
  return ALL_AGENT_IDS;
}
