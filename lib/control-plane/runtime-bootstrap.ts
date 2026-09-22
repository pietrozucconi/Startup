import {
  BrainGateway,
} from '@/lib/brain/gateway/gateway';

import {
  StartupBrainProposalHandoffSink,
} from '@/lib/control-plane/brain-handoff-sink';

import {
  DefaultBrainHandoffMutationComposer,
} from '@/lib/control-plane/default-brain-memory-composer';

import {
  GovernedHandoffSinkRegistry,
} from '@/lib/control-plane/handoff-dispatcher';

import {
  registerCoreInternalRuntimeSinks,
} from '@/lib/control-plane/internal-runtime-adapters';

import type {
  InternalRuntimeStore,
} from '@/lib/control-plane/runtime-store';

export function buildInternalRuntimeSinkRegistry(input: {
  store: InternalRuntimeStore;
  brainGateway?: BrainGateway;
}): GovernedHandoffSinkRegistry {
  const registry =
    new GovernedHandoffSinkRegistry();

  registerCoreInternalRuntimeSinks(
    registry,
    input.store,
  );

  if (input.brainGateway) {
    registry.register(
      new StartupBrainProposalHandoffSink(
        input.brainGateway,
        new DefaultBrainHandoffMutationComposer(),
      ),
    );
  }

  return registry;
}
