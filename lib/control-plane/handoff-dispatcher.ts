import type {
  GovernedHandoff,
  HandoffDestination,
} from '@/lib/control-plane/handoff-schema';

import type {
  GovernedHandoffStore,
} from '@/lib/control-plane/handoff-store';

export type GovernedHandoffDeliveryContext = {
  handoff: GovernedHandoff;

  /**
   * Stable idempotency key for downstream systems.
   * External or durable destinations should use this key whenever
   * their API supports idempotency.
   */
  idempotencyKey: string;

  deliveryAttempt: number;
};

export type GovernedHandoffDeliveryResult = {
  result?: Record<string, unknown>;
};

export interface GovernedHandoffSink {
  id: string;

  destination: HandoffDestination;

  deliver(
    context: GovernedHandoffDeliveryContext,
  ): Promise<GovernedHandoffDeliveryResult>;
}

function destinationKey(
  destination: HandoffDestination,
): string {
  return `${destination.kind}:${destination.id}`;
}

export class GovernedHandoffSinkRegistry {
  private readonly sinks =
    new Map<string, GovernedHandoffSink>();

  register(
    sink: GovernedHandoffSink,
  ): void {
    if (!sink.id.trim()) {
      throw new Error(
        'handoff_sink_id_required',
      );
    }

    const key = destinationKey(
      sink.destination,
    );

    const existing =
      this.sinks.get(key);

    if (existing) {
      throw new Error(
        `handoff_destination_already_registered:${key}:${existing.id}`,
      );
    }

    this.sinks.set(
      key,
      sink,
    );
  }

  resolve(
    destination: HandoffDestination,
  ): GovernedHandoffSink | null {
    return (
      this.sinks.get(
        destinationKey(
          destination,
        ),
      ) ?? null
    );
  }
}

export type GovernedHandoffDispatcherOptions = {
  workerId: string;
  batchSize: number;
  leaseMs: number;
};

export type GovernedHandoffDispatcherResult = {
  claimed: number;
  delivered: number;
  failed: number;
  missingSink: number;
};

function errorMessage(
  error: unknown,
): string {
  return error instanceof Error
    ? error.message
    : String(error);
}

export class GovernedHandoffDispatcher {
  constructor(
    private readonly store:
      GovernedHandoffStore,
    private readonly registry:
      GovernedHandoffSinkRegistry,
    private readonly options:
      GovernedHandoffDispatcherOptions,
  ) {}

  async runOnce(
    now: string,
  ): Promise<GovernedHandoffDispatcherResult> {
    const handoffs =
      this.store.claimHandoffs({
        workerId:
          this.options.workerId,
        now,
        limit:
          this.options.batchSize,
        leaseMs:
          this.options.leaseMs,
      });

    const stats:
      GovernedHandoffDispatcherResult = {
      claimed: handoffs.length,
      delivered: 0,
      failed: 0,
      missingSink: 0,
    };

    for (const handoff of handoffs) {
      const sink =
        this.registry.resolve(
          handoff.destination,
        );

      if (!sink) {
        stats.failed += 1;
        stats.missingSink += 1;

        this.store.failHandoff({
          handoffId:
            handoff.handoffId,
          workerId:
            this.options.workerId,
          failedAt: now,
          error:
            `handoff_sink_not_registered:${destinationKey(
              handoff.destination,
            )}`,
        });

        continue;
      }

      try {
        await sink.deliver({
          handoff,
          idempotencyKey:
            `handoff:${handoff.handoffId}`,
          deliveryAttempt:
            handoff.attempts,
        });

        this.store.completeHandoff({
          handoffId:
            handoff.handoffId,
          workerId:
            this.options.workerId,
          deliveredAt: now,
        });

        stats.delivered += 1;
      } catch (error) {
        this.store.failHandoff({
          handoffId:
            handoff.handoffId,
          workerId:
            this.options.workerId,
          failedAt: now,
          error:
            errorMessage(error),
        });

        stats.failed += 1;
      }
    }

    return stats;
  }
}
