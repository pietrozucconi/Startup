import type {
  ControlPlaneOutboxMessage,
} from '@/lib/control-plane/durable-schema';

export type ReliableConsumerContext = {
  message: ControlPlaneOutboxMessage;

  /**
   * Stable key that MUST be forwarded to an external provider when
   * that provider supports idempotency.
   *
   * This protects the crash window between an external side effect
   * and the local delivery receipt being committed.
   */
  idempotencyKey: string;

  deliveryAttempt: number;
};

export type ReliableConsumerResult = {
  result?: Record<string, unknown>;
};

export interface ReliableOutboxConsumer {
  id: string;
  topics: readonly string[];

  handle(
    context: ReliableConsumerContext,
  ): Promise<ReliableConsumerResult>;
}

/**
 * One topic resolves to exactly one consumer in V2C.
 *
 * If future workflows require fan-out, the producer must create one
 * outbox message per destination rather than silently sharing one
 * delivery receipt across multiple consumers.
 */
export class OutboxConsumerRegistry {
  private readonly byTopic =
    new Map<string, ReliableOutboxConsumer>();

  register(
    consumer: ReliableOutboxConsumer,
  ): void {
    if (!consumer.id.trim()) {
      throw new Error(
        'consumer_id_required',
      );
    }

    if (consumer.topics.length === 0) {
      throw new Error(
        `consumer_topics_required:${consumer.id}`,
      );
    }

    for (const topic of consumer.topics) {
      const existing =
        this.byTopic.get(topic);

      if (existing) {
        throw new Error(
          `consumer_topic_already_registered:${topic}:${existing.id}`,
        );
      }

      this.byTopic.set(
        topic,
        consumer,
      );
    }
  }

  resolve(
    topic: string,
  ): ReliableOutboxConsumer | null {
    return this.byTopic.get(topic) ?? null;
  }

  topics(): string[] {
    return [
      ...this.byTopic.keys(),
    ].sort();
  }
}
