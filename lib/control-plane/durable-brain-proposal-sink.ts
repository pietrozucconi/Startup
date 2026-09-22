import {
  BrainMutationProposalSchema,
} from '@/lib/brain/gateway/schema';

import {
  BrainGateway,
} from '@/lib/brain/gateway/gateway';

import type {
  BrainHandoffMutationComposer,
} from '@/lib/control-plane/brain-handoff-sink';

import type {
  GovernedHandoff,
} from '@/lib/control-plane/handoff-schema';

import type {
  GovernedHandoffSink,
} from '@/lib/control-plane/handoff-dispatcher';

import type {
  HardenedRuntimeStore,
} from '@/lib/control-plane/hardened-runtime-store';

function errorMessage(
  error: unknown,
): string {
  return error instanceof Error
    ? error.message
    : String(error);
}

/**
 * Persists the mutation proposal before asking BrainGateway to validate/audit it.
 * This sink never commits a Brain mutation.
 */
export class DurableStartupBrainProposalHandoffSink
  implements GovernedHandoffSink
{
  readonly id =
    'durable-startup-brain-proposal-sink';

  readonly destination = {
    kind:
      'startup_brain',
    id:
      'startup-brain',
  } as const;

  constructor(
    private readonly store:
      HardenedRuntimeStore,

    private readonly brainGateway:
      BrainGateway,

    private readonly composer:
      BrainHandoffMutationComposer,

    private readonly clock:
      () => string = () =>
        new Date().toISOString(),
  ) {}

  async deliver(input: {
    handoff:
      GovernedHandoff;

    idempotencyKey:
      string;

    deliveryAttempt:
      number;
  }) {
    const proposalInput =
      await this.composer.compose({
        handoff:
          input.handoff,

        idempotencyKey:
          input.idempotencyKey,
      });

    if (!proposalInput) {
      return {
        result: {
          proposed: false,
          reason:
            'memory_composer_judged_handoff_not_worth_persisting',
        },
      };
    }

    const proposal =
      BrainMutationProposalSchema.parse(
        proposalInput,
      );

    const persisted =
      this.store.persistBrainMutationProposal({
        handoffId:
          input.handoff.handoffId,
        proposal,
        persistedAt:
          this.clock(),
      });

    try {
      const result =
        await this.brainGateway.proposeMutation(
          proposal,
        );

      const updated =
        this.store.updateBrainMutationProposal({
          proposalId:
            proposal.proposalId,
          status:
            'pending_control_plane',
          updatedAt:
            this.clock(),
          graphRevision:
            result.graphRevision,
        });

      return {
        result: {
          proposed: true,
          proposalId:
            updated.proposalId,
          durableStatus:
            updated.status,
          graphRevision:
            result.graphRevision,
          gatewayStatus:
            result.status,
          proposalDigest:
            persisted.proposalDigest,
        },
      };
    } catch (error) {
      this.store.updateBrainMutationProposal({
        proposalId:
          proposal.proposalId,
        status:
          'failed',
        updatedAt:
          this.clock(),
        lastError:
          errorMessage(error),
      });

      throw error;
    }
  }
}
