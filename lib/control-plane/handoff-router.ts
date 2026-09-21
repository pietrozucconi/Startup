import type {
  ReliableOutboxConsumer,
  ReliableConsumerResult,
} from '@/lib/control-plane/consumer';

import {
  CONTROL_PLANE_ROUTABLE_TOPICS,
  planGovernedHandoffs,
} from '@/lib/control-plane/handoff-policy';

import type {
  GovernedHandoffStore,
} from '@/lib/control-plane/handoff-store';

export class GovernedHandoffRouterConsumer
  implements ReliableOutboxConsumer
{
  readonly id =
    'governed-handoff-router';

  readonly topics =
    CONTROL_PLANE_ROUTABLE_TOPICS;

  constructor(
    private readonly store:
      GovernedHandoffStore,
  ) {}

  async handle(
    context: Parameters<
      ReliableOutboxConsumer['handle']
    >[0],
  ): Promise<ReliableConsumerResult> {
    const workflow =
      context.message.workflowId
        ? await this.store.getWorkflow(
            context.message.workflowId,
          )
        : undefined;

    const plans =
      planGovernedHandoffs({
        message: context.message,
        workflow:
          workflow ?? undefined,
      });

    const stored =
      this.store.enqueueHandoffsIdempotent(
        plans,
      );

    return {
      result: {
        handoffCount:
          stored.length,
        handoffIds:
          stored.map(
            (handoff) =>
              handoff.handoffId,
          ),
      },
    };
  }
}
