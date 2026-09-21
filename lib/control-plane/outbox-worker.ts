import {
  OutboxConsumerRegistry,
} from '@/lib/control-plane/consumer';

import type {
  ReliableConsumerStore,
} from '@/lib/control-plane/reliable-store';

export type ReliableOutboxWorkerOptions = {
  workerId: string;
  batchSize: number;
  outboxLeaseMs: number;
  consumerLeaseMs: number;
};

export type ReliableOutboxWorkerRunResult = {
  claimed: number;
  succeeded: number;
  deduplicated: number;
  failed: number;
  busy: number;
  missingConsumer: number;
};

function errorMessage(
  error: unknown,
): string {
  return error instanceof Error
    ? error.message
    : String(error);
}

/**
 * Delivery semantics:
 *
 * - Outbox transport is at-least-once.
 * - Successful consumer receipts are persistent.
 * - A repeated outbox delivery whose receipt already succeeded skips
 *   the handler and only acknowledges the outbox message.
 * - A handler MUST use the stable idempotencyKey for any external
 *   side effect when the provider supports idempotency.
 *
 * This intentionally does not claim impossible distributed
 * exactly-once semantics.
 */
export class ReliableOutboxWorker {
  constructor(
    private readonly store: ReliableConsumerStore,
    private readonly registry: OutboxConsumerRegistry,
    private readonly options: ReliableOutboxWorkerOptions,
  ) {
    if (!options.workerId.trim()) {
      throw new Error(
        'outbox_worker_id_required',
      );
    }

    if (options.batchSize <= 0) {
      throw new Error(
        'outbox_worker_batch_size_must_be_positive',
      );
    }

    if (
      options.outboxLeaseMs <= 0 ||
      options.consumerLeaseMs <= 0
    ) {
      throw new Error(
        'outbox_worker_lease_must_be_positive',
      );
    }
  }

  async runOnce(
    now: string,
  ): Promise<ReliableOutboxWorkerRunResult> {
    const messages =
      this.store.claimOutbox({
        workerId:
          this.options.workerId,
        now,
        limit:
          this.options.batchSize,
        leaseMs:
          this.options.outboxLeaseMs,
      });

    const stats: ReliableOutboxWorkerRunResult = {
      claimed: messages.length,
      succeeded: 0,
      deduplicated: 0,
      failed: 0,
      busy: 0,
      missingConsumer: 0,
    };

    for (const message of messages) {
      const consumer =
        this.registry.resolve(
          message.topic,
        );

      if (!consumer) {
        stats.missingConsumer += 1;
        stats.failed += 1;

        this.store.failOutbox({
          messageId:
            message.messageId,
          workerId:
            this.options.workerId,
          failedAt: now,
          error:
            `no_consumer_registered:${message.topic}`,
        });

        continue;
      }

      const claim =
        this.store.claimConsumerDelivery({
          consumerId: consumer.id,
          messageId:
            message.messageId,
          topic:
            message.topic,
          workerId:
            this.options.workerId,
          now,
          leaseMs:
            this.options.consumerLeaseMs,
        });

      if (
        claim.outcome ===
        'already_succeeded'
      ) {
        this.store.acknowledgeOutbox({
          messageId:
            message.messageId,
          workerId:
            this.options.workerId,
          publishedAt: now,
        });

        stats.deduplicated += 1;
        continue;
      }

      if (
        claim.outcome === 'busy'
      ) {
        this.store.failOutbox({
          messageId:
            message.messageId,
          workerId:
            this.options.workerId,
          failedAt: now,
          error:
            `consumer_delivery_busy:${consumer.id}:${message.messageId}`,
        });

        stats.busy += 1;
        stats.failed += 1;
        continue;
      }

      const idempotencyKey =
        `${consumer.id}:${message.messageId}`;

      let consumerResult:
        | Record<string, unknown>
        | undefined;

      try {
        const handled =
          await consumer.handle({
            message,
            idempotencyKey,
            deliveryAttempt:
              claim.receipt.attempts,
          });

        consumerResult =
          handled.result;
      } catch (error) {
        const reason =
          errorMessage(error);

        this.store.failConsumerDelivery({
          consumerId: consumer.id,
          messageId:
            message.messageId,
          workerId:
            this.options.workerId,
          failedAt: now,
          error: reason,
        });

        this.store.failOutbox({
          messageId:
            message.messageId,
          workerId:
            this.options.workerId,
          failedAt: now,
          error: reason,
        });

        stats.failed += 1;
        continue;
      }

      /*
       * Important ordering:
       *
       * 1. persist successful consumer receipt
       * 2. acknowledge outbox
       *
       * If the process crashes between 1 and 2, the next delivery
       * sees already_succeeded and does not execute the consumer again.
       */
      this.store.completeConsumerDelivery({
        consumerId: consumer.id,
        messageId:
          message.messageId,
        workerId:
          this.options.workerId,
        completedAt: now,
        result: consumerResult,
      });

      this.store.acknowledgeOutbox({
        messageId:
          message.messageId,
        workerId:
          this.options.workerId,
        publishedAt: now,
      });

      stats.succeeded += 1;
    }

    return stats;
  }
}
