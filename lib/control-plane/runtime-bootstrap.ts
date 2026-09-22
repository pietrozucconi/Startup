import {
  BrainGateway,
} from '@/lib/brain/gateway/gateway';

import {
  DefaultBrainHandoffMutationComposer,
} from '@/lib/control-plane/default-brain-memory-composer';

import {
  DurableStartupBrainProposalHandoffSink,
} from '@/lib/control-plane/durable-brain-proposal-sink';

import {
  GovernedHandoffSinkRegistry,
} from '@/lib/control-plane/handoff-dispatcher';

import {
  isHardenedRuntimeStore,
} from '@/lib/control-plane/hardened-runtime-store';

import {
  registerCoreInternalRuntimeSinks,
} from '@/lib/control-plane/internal-runtime-adapters';

import type {
  InternalRuntimeStore,
} from '@/lib/control-plane/runtime-store';

export function buildInternalRuntimeSinkRegistry(input: {
  store:
    InternalRuntimeStore;

  brainGateway?:
    BrainGateway;
}): GovernedHandoffSinkRegistry {
  const registry =
    new GovernedHandoffSinkRegistry();

  registerCoreInternalRuntimeSinks(
    registry,
    input.store,
  );

  if (input.brainGateway) {
    if (
      !isHardenedRuntimeStore(
        input.store,
      )
    ) {
      throw new Error(
        'durable_brain_proposal_store_required',
      );
    }

    registry.register(
      new DurableStartupBrainProposalHandoffSink(
        input.store,
        input.brainGateway,
        new DefaultBrainHandoffMutationComposer(),
      ),
    );
  }

  return registry;
}
