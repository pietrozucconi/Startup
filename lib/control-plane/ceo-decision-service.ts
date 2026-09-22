import { z } from 'zod';

import type {
  InvestmentWorkflow,
} from '@/lib/control-plane/schema';

import {
  AtomicCompanyControlPlane,
} from '@/lib/control-plane/atomic-engine';

import type {
  AtomicControlPlaneStore,
} from '@/lib/control-plane/atomic-store';

import type {
  InternalRuntimeStore,
} from '@/lib/control-plane/runtime-store';

import type {
  CeoInboxItem,
} from '@/lib/control-plane/runtime-schema';

const ResearchDecisionSchema = z.enum([
  'approved',
  'rejected',
]);

export const CeoResearchDecisionInputSchema = z.object({
  inboxId: z.string().min(1),
  decision: ResearchDecisionSchema,
  reason: z.string().min(1),
});

export const CeoExecutionConfirmationInputSchema = z.object({
  inboxId: z.string().min(1),

  executionPrice: z.coerce
    .number()
    .finite()
    .positive(),

  quantity: z.coerce
    .number()
    .finite()
    .positive(),

  fees: z.coerce
    .number()
    .finite()
    .min(0)
    .optional(),

  currency: z
    .string()
    .trim()
    .min(1)
    .max(16)
    .optional(),

  note: z
    .string()
    .trim()
    .max(2_000)
    .optional(),
});

export type CeoResearchDecisionInput = z.input<
  typeof CeoResearchDecisionInputSchema
>;

export type CeoExecutionConfirmationInput = z.input<
  typeof CeoExecutionConfirmationInputSchema
>;

type GovernedCeoStore =
  InternalRuntimeStore &
  AtomicControlPlaneStore;

function sanitizeIdPart(
  value: string,
): string {
  return value.replace(
    /[^a-zA-Z0-9_.:-]/g,
    '_',
  );
}

function ceoPrincipal() {
  return {
    actor: {
      kind: 'human' as const,
      id: 'ceo',
    },
  };
}

function internalPrincipal() {
  return {
    actor: {
      kind: 'control_plane' as const,
      id:
        'company-control-plane',
    },
  };
}

/**
 * Human decisions are translated into normal Control Plane commands.
 *
 * No UI action edits workflow snapshots directly.
 */
export class GovernedCeoDecisionService {
  private readonly controlPlane:
    AtomicCompanyControlPlane;

  constructor(
    private readonly store:
      GovernedCeoStore,
    private readonly clock: () => string = () =>
      new Date().toISOString(),
  ) {
    this.controlPlane =
      new AtomicCompanyControlPlane(
        store,
        this.clock,
      );
  }

  async decideResearch(
    rawInput: CeoResearchDecisionInput,
  ) {
    const input =
      CeoResearchDecisionInputSchema.parse(
        rawInput,
      );

    const item =
      this.requireInbox(
        input.inboxId,
        'decide_research_proposal',
      );

    const workflow =
      await this.requireWorkflow(
        item,
      );

    const existingDecision =
      workflow.artifacts.find(
        (artifact) =>
          artifact.kind ===
            'ceo_research_decision' &&
          artifact.createdBy.kind ===
            'human' &&
          artifact.createdBy.id ===
            'ceo' &&
          artifact.status ===
            'active',
      );

    if (
      existingDecision &&
      existingDecision.metadata
        .decision !==
        input.decision
    ) {
      throw new Error(
        `ceo_research_decision_conflict:${workflow.id}`,
      );
    }

    if (
      item.status === 'resolved'
    ) {
      return {
        workflow,
        duplicate: true,
      };
    }

    const safeInboxId =
      sanitizeIdPart(
        item.inboxId,
      );

    const artifactRequestId =
      `ceo:${safeInboxId}:research:${input.decision}:artifact`;

    const transitionRequestId =
      `ceo:${safeInboxId}:research:${input.decision}:transition`;

    const autoAdvanceRequestId =
      `control-plane:${safeInboxId}:research:${input.decision}:advance`;

    const targetState =
      input.decision === 'approved'
        ? 'CEO_RESEARCH_APPROVED'
        : 'CEO_RESEARCH_REJECTED';

    const finalState =
      input.decision === 'approved'
        ? 'RISK_ANALYSIS'
        : 'ARCHIVED';

    const artifactResult =
      await this.controlPlane.registerArtifact({
        requestId:
          artifactRequestId,
        workflowId:
          workflow.id,
        principal:
          ceoPrincipal(),
        expectedRevision:
          workflow.revision,
        artifact: {
          id:
            `artifact:${safeInboxId}:ceo-research-decision`,
          workflowId:
            workflow.id,
          kind:
            'ceo_research_decision',
          createdBy:
            ceoPrincipal().actor,
          createdAt:
            this.clock(),
          summary:
            `CEO research decision: ${input.decision}. ${input.reason}`,
          status:
            'active',
          metadata: {
            decision:
              input.decision,
            reason:
              input.reason,
            inboxId:
              item.inboxId,
            humanDecision:
              true,
          },
        },
        reason:
          input.reason,
      });

    const ceoTransition =
      await this.controlPlane.transition({
        requestId:
          transitionRequestId,
        workflowId:
          workflow.id,
        principal:
          ceoPrincipal(),
        fromState:
          'WAITING_CEO_RESEARCH_DECISION',
        toState:
          targetState,
        expectedRevision:
          artifactResult.workflow.revision,
        reason:
          input.reason,
      });

    const advanced =
      await this.controlPlane.transition({
        requestId:
          autoAdvanceRequestId,
        workflowId:
          workflow.id,
        principal:
          internalPrincipal(),
        fromState:
          targetState,
        toState:
          finalState,
        expectedRevision:
          ceoTransition.workflow.revision,
        reason:
          input.decision ===
          'approved'
            ? 'CEO research approval deterministically opens governed risk analysis.'
            : 'CEO research rejection deterministically archives the rejected workflow.',
      });

    this.store.resolveCeoInboxAfterControlPlane({
      inboxId:
        item.inboxId,
      controlPlaneRequestId:
        transitionRequestId,
      resolvedAt:
        this.clock(),
    });

    return {
      workflow:
        advanced.workflow,
      duplicate:
        artifactResult.duplicate &&
        ceoTransition.duplicate &&
        advanced.duplicate,
    };
  }

  async confirmManualExecution(
    rawInput:
      CeoExecutionConfirmationInput,
  ) {
    const input =
      CeoExecutionConfirmationInputSchema.parse(
        rawInput,
      );

    const item =
      this.requireInbox(
        input.inboxId,
        'perform_manual_execution_decision',
      );

    const workflow =
      await this.requireWorkflow(
        item,
      );

    const existingConfirmation =
      workflow.artifacts.find(
        (artifact) =>
          artifact.kind ===
            'ceo_execution_confirmation' &&
          artifact.createdBy.kind ===
            'human' &&
          artifact.createdBy.id ===
            'ceo' &&
          artifact.status ===
            'active',
      );

    if (existingConfirmation) {
      const metadata =
        existingConfirmation.metadata;

      if (
        metadata.executionPrice !==
          Number(
            input.executionPrice,
          ) ||
        metadata.quantity !==
          Number(input.quantity)
      ) {
        throw new Error(
          `ceo_execution_confirmation_conflict:${workflow.id}`,
        );
      }
    }

    if (
      item.status === 'resolved'
    ) {
      return {
        workflow,
        duplicate: true,
      };
    }

    if (
      !existingConfirmation &&
      workflow.invalidations.some(
        (invalidation) =>
          invalidation.status ===
          'active',
      )
    ) {
      throw new Error(
        'active_material_invalidation_blocks_execution_confirmation',
      );
    }

    const safeInboxId =
      sanitizeIdPart(
        item.inboxId,
      );

    const artifactRequestId =
      `ceo:${safeInboxId}:execution:artifact`;

    const transitionRequestId =
      `ceo:${safeInboxId}:execution:transition`;

    const monitoringRequestId =
      `control-plane:${safeInboxId}:execution:monitoring`;

    const executionRecordedAt =
      this.clock();

    const artifactResult =
      await this.controlPlane.registerArtifact({
        requestId:
          artifactRequestId,
        workflowId:
          workflow.id,
        principal:
          ceoPrincipal(),
        expectedRevision:
          workflow.revision,
        artifact: {
          id:
            `artifact:${safeInboxId}:ceo-execution-confirmation`,
          workflowId:
            workflow.id,
          kind:
            'ceo_execution_confirmation',
          createdBy:
            ceoPrincipal().actor,
          createdAt:
            executionRecordedAt,
          summary:
            'CEO confirmed that the approved trade was manually executed outside the platform.',
          status:
            'active',
          metadata: {
            manualExecutionConfirmed:
              true,
            executionPrice:
              Number(
                input.executionPrice,
              ),
            quantity:
              Number(input.quantity),
            fees:
              input.fees ===
              undefined
                ? undefined
                : Number(
                    input.fees,
                  ),
            currency:
              input.currency,
            note:
              input.note,
            executionRecordedAt,
            inboxId:
              item.inboxId,
          },
        },
        reason:
          'Human CEO confirmed manual execution and supplied observed execution details.',
      });

    const confirmation =
      await this.controlPlane.transition({
        requestId:
          transitionRequestId,
        workflowId:
          workflow.id,
        principal:
          ceoPrincipal(),
        fromState:
          'WAITING_CEO_EXECUTION',
        toState:
          'CEO_EXECUTION_CONFIRMED',
        expectedRevision:
          artifactResult.workflow.revision,
        reason:
          'Human CEO confirmed manual execution.',
      });

    const monitoring =
      await this.controlPlane.transition({
        requestId:
          monitoringRequestId,
        workflowId:
          workflow.id,
        principal:
          internalPrincipal(),
        fromState:
          'CEO_EXECUTION_CONFIRMED',
        toState:
          'MONITORING',
        expectedRevision:
          confirmation.workflow.revision,
        reason:
          'Confirmed manual execution deterministically opens governed monitoring.',
      });

    this.store.resolveCeoInboxAfterControlPlane({
      inboxId:
        item.inboxId,
      controlPlaneRequestId:
        transitionRequestId,
      resolvedAt:
        this.clock(),
    });

    return {
      workflow:
        monitoring.workflow,
      duplicate:
        artifactResult.duplicate &&
        confirmation.duplicate &&
        monitoring.duplicate,
    };
  }

  private requireInbox(
    inboxId: string,
    expectedAction: string,
  ): CeoInboxItem {
    const item =
      this.store
        .listCeoInbox()
        .find(
          (candidate) =>
            candidate.inboxId ===
            inboxId,
        );

    if (!item) {
      throw new Error(
        `ceo_inbox_item_not_found:${inboxId}`,
      );
    }

    if (
      item.category !==
      'approval_request'
    ) {
      throw new Error(
        `ceo_inbox_item_not_approval_request:${inboxId}`,
      );
    }

    if (
      item.action !==
      expectedAction
    ) {
      throw new Error(
        `ceo_inbox_action_mismatch:${expectedAction}:${item.action}`,
      );
    }

    return item;
  }

  private async requireWorkflow(
    item: CeoInboxItem,
  ): Promise<InvestmentWorkflow> {
    if (!item.workflowId) {
      throw new Error(
        `ceo_inbox_workflow_required:${item.inboxId}`,
      );
    }

    const workflow =
      await this.store.getWorkflow(
        item.workflowId,
      );

    if (!workflow) {
      throw new Error(
        `workflow_not_found:${item.workflowId}`,
      );
    }

    return workflow;
  }
}
