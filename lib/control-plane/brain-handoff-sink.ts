import {
  BrainMutationProposalSchema,
  type BrainMutationProposalInput,
} from '@/lib/brain/gateway/schema';

import {
  BrainGateway,
} from '@/lib/brain/gateway/gateway';

import type {
  GovernedHandoff,
} from '@/lib/control-plane/handoff-schema';

import type {
  GovernedHandoffSink,
} from '@/lib/control-plane/handoff-dispatcher';

/**
 * The Control Plane intentionally does NOT fabricate Brain graph events.
 *
 * A memory composer translates a governed handoff into a structured
 * BrainMutationProposal. That proposal still goes through BrainGateway
 * permissions and remains only a proposal; this sink never commits it.
 */
export interface BrainHandoffMutationComposer {
  compose(input: {
    handoff: GovernedHandoff;
    idempotencyKey: string;
  }): Promise<
    BrainMutationProposalInput | null
  >;
}

export class StartupBrainProposalHandoffSink
  implements GovernedHandoffSink
{
  readonly id =
    'startup-brain-proposal-sink';

  readonly destination = {
    kind: 'startup_brain',
    id: 'startup-brain',
  } as const;

  constructor(
    private readonly brainGateway:
      BrainGateway,
    private readonly composer:
      BrainHandoffMutationComposer,
  ) {}

  async deliver(input: {
    handoff: GovernedHandoff;
    idempotencyKey: string;
    deliveryAttempt: number;
  }) {
    const proposalInput =
      await this.composer.compose({
        handoff: input.handoff,
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

    const result =
      await this.brainGateway.proposeMutation(
        proposal,
      );

    return {
      result: {
        proposed: true,
        proposalId:
          result.proposal.proposalId,
        graphRevision:
          result.graphRevision,
        status: result.status,
      },
    };
  }
}
