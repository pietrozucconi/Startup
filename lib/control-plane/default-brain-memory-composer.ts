import type {
  BrainGraphNodeType,
} from '@/lib/brain/graph-schema';

import type {
  BrainMutationProposalInput,
} from '@/lib/brain/gateway/schema';

import type {
  BrainHandoffMutationComposer,
} from '@/lib/control-plane/brain-handoff-sink';

function sanitizeIdPart(
  value: string,
): string {
  return value.replace(
    /[^a-zA-Z0-9_.:-]/g,
    '_',
  );
}

function memoryNodeType(
  action: string,
): BrainGraphNodeType {
  if (
    action.includes(
      'post_mortem',
    )
  ) {
    return 'post_mortem';
  }

  if (
    action.includes(
      'invalidation',
    )
  ) {
    return 'event';
  }

  if (
    action.includes(
      'decision',
    ) ||
    action.includes(
      'approval',
    ) ||
    action.includes(
      'rejection',
    )
  ) {
    return 'decision';
  }

  return 'experience';
}

/**
 * Deterministic first memory composer.
 *
 * It does not invent analysis or hidden reasoning.
 * It only packages facts already contained in the governed handoff
 * into a raw-memory mutation proposal for Brain Gateway review.
 */
export class DefaultBrainHandoffMutationComposer
  implements BrainHandoffMutationComposer
{
  async compose(input: {
    handoff: Parameters<
      BrainHandoffMutationComposer['compose']
    >[0]['handoff'];
    idempotencyKey: string;
  }): Promise<
    BrainMutationProposalInput | null
  > {
    const handoff =
      input.handoff;

    if (
      handoff.kind !==
      'memory_candidate'
    ) {
      return null;
    }

    const actor = {
      kind: 'system' as const,
      id:
        'startup-brain-memory-composer',
    };

    const nodeId =
      `memory-candidate:${sanitizeIdPart(
        handoff.handoffId,
      )}`;

    const proposalId =
      `brain-proposal:${sanitizeIdPart(
        handoff.handoffId,
      )}`;

    const requestId =
      `brain-proposal-request:${sanitizeIdPart(
        handoff.handoffId,
      )}`;

    const nodeType =
      memoryNodeType(
        handoff.action,
      );

    const context = {
      workflowIds:
        handoff.workflowId
          ? [handoff.workflowId]
          : [],
      tags: [
        'control-plane-handoff',
        'memory-candidate',
        handoff.action,
      ],
    };

    return {
      proposalId,
      requestId,

      principal: {
        actor,
        departmentIds: [],
        capabilities: [
          'brain.propose_write',
        ],
        issuedBy:
          'company-control-plane',
      },

      purpose:
        'Convert a governed company event into a raw institutional-memory proposal.',

      reason:
        'The Control Plane routed this event as a memory candidate. The proposal preserves the event without turning it into a validated lesson.',

      proposedAt:
        handoff.createdAt,

      context,

      events: [
        {
          eventId:
            `brain-event:${sanitizeIdPart(
              handoff.handoffId,
            )}:node-added`,

          at:
            handoff.createdAt,

          actor,

          reason:
            'governed_handoff_memory_candidate',

          correlationId:
            handoff.workflowId,

          causationId:
            handoff.sourceMessageId,

          type:
            'node_added',

          payload: {
            node: {
              id: nodeId,
              type: nodeType,
              label:
                handoff.summary,
              summary:
                handoff.summary,

              content:
                JSON.stringify(
                  handoff.payload,
                ),

              rationaleSummary:
                '',

              status:
                'pending',

              tags: [
                'memory-candidate',
                handoff.action,
              ],

              keywords: [
                handoff.action,
                handoff.kind,
              ],

              context,

              memory: {
                system:
                  'episodic',
                stage:
                  'raw_experience',
                salience: {
                  materiality:
                    handoff.action.includes(
                      'invalidation',
                    )
                      ? 0.8
                      : 0.5,
                  urgency:
                    handoff.action.includes(
                      'invalidation',
                    )
                      ? 0.8
                      : 0.2,
                  riskImpact:
                    handoff.action.includes(
                      'risk',
                    ) ||
                    handoff.action.includes(
                      'invalidation',
                    )
                      ? 0.8
                      : 0.3,
                },
                activation: 0,
                retentionStrength: 1,
                consolidationScore: 0,
                accessCount: 0,
                rehearsalCount: 0,
                retentionLock: false,
                pendingReview: true,
              },

              governance: {
                visibility:
                  'internal',
                humanApprovalRequired:
                  false,
                immutable:
                  false,
              },

              audit: {
                createdAt:
                  handoff.createdAt,
                createdBy:
                  actor,
              },

              metadata: {
                sourceHandoffId:
                  handoff.handoffId,
                sourceMessageId:
                  handoff.sourceMessageId,
                sourceTopic:
                  handoff.sourceTopic,
                action:
                  handoff.action,
                policyEvidence:
                  handoff.policyEvidence,
                idempotencyKey:
                  input.idempotencyKey,
                lessonStatus:
                  'not_validated',
              },
            },
          },
        },
      ],
    };
  }
}
