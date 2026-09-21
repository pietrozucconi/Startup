import type {
  GovernedHandoff,
  GovernedHandoffInput,
} from '@/lib/control-plane/handoff-schema';

import type {
  ReliableConsumerStore,
} from '@/lib/control-plane/reliable-store';

import type {
  ControlPlaneStore,
} from '@/lib/control-plane/store';

export interface GovernedHandoffStore
extends ReliableConsumerStore,
ControlPlaneStore
{
  enqueueHandoffsIdempotent(
    handoffs: GovernedHandoffInput[],
  ): GovernedHandoff[];

  listHandoffs(input?: {
    workflowId?: string;
    destinationKind?: GovernedHandoff['destination']['kind'];
    destinationId?: string;
    status?: GovernedHandoff['status'];
  }): GovernedHandoff[];

  claimHandoffs(input: {
    workerId: string;
    now: string;
    limit: number;
    leaseMs: number;
  }): GovernedHandoff[];

  completeHandoff(input: {
    handoffId: string;
    workerId: string;
    deliveredAt: string;
  }): GovernedHandoff;

  failHandoff(input: {
    handoffId: string;
    workerId: string;
    failedAt: string;
    error: string;
  }): GovernedHandoff;

  cancelHandoff(input: {
    handoffId: string;
    reason: string;
  }): GovernedHandoff;
}
