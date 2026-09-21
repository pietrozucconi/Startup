import type {
  ConsumerDeliveryClaimResult,
  ConsumerDeliveryReceipt,
  DeadLetterRedriveRecord,
} from '@/lib/control-plane/consumer-schema';

import type {
  ControlPlaneOutboxStore,
} from '@/lib/control-plane/durable';

export interface ReliableConsumerStore
  extends ControlPlaneOutboxStore
{
  claimConsumerDelivery(input: {
    consumerId: string;
    messageId: string;
    topic: string;
    workerId: string;
    now: string;
    leaseMs: number;
  }): ConsumerDeliveryClaimResult;

  completeConsumerDelivery(input: {
    consumerId: string;
    messageId: string;
    workerId: string;
    completedAt: string;
    result?: Record<string, unknown>;
  }): ConsumerDeliveryReceipt;

  failConsumerDelivery(input: {
    consumerId: string;
    messageId: string;
    workerId: string;
    failedAt: string;
    error: string;
  }): ConsumerDeliveryReceipt;

  getConsumerDeliveryReceipt(input: {
    consumerId: string;
    messageId: string;
  }): ConsumerDeliveryReceipt | null;

  listConsumerDeliveryReceipts(
    consumerId?: string,
  ): ConsumerDeliveryReceipt[];

  redriveDeadLetter(
    record: DeadLetterRedriveRecord,
    availableAt: string,
  ): void;

  listDeadLetterRedrives(
    messageId?: string,
  ): DeadLetterRedriveRecord[];
}
