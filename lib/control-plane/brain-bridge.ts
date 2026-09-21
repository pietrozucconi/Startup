import type {
  BrainMutationApproval,
  BrainMutationProposal,
} from '@/lib/brain/gateway/schema';

import {
  BrainGateway,
} from '@/lib/brain/gateway/gateway';

/**
 * Internal adapter used by the Company Control Plane after it has
 * already authorized a permanent Startup Brain mutation.
 *
 * Agents never receive this principal and never call this bridge
 * directly.
 */
export class ControlPlaneBrainBridge {
  constructor(
    private readonly brainGateway: BrainGateway,
    private readonly controlPlaneId =
      'company-control-plane',
  ) {}

  async commitAuthorizedProposal(input: {
    requestId: string;
    proposal: BrainMutationProposal;
    approval?: BrainMutationApproval;
    expectedRevision?: number;
  }) {
    return this.brainGateway.commitMutation({
      requestId: input.requestId,
      principal: {
        actor: {
          kind: 'control_plane',
          id: this.controlPlaneId,
        },
        capabilities: [
          'brain.commit_write',
        ],
        departmentIds: [],
        issuedBy: this.controlPlaneId,
      },
      proposal: input.proposal,
      approval: input.approval,
      expectedRevision:
        input.expectedRevision,
    });
  }
}
