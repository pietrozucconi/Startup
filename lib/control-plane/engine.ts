import {
  CreateWorkflowRequestSchema,
  FinancialActionRequestSchema,
  InvestmentWorkflowSchema,
  RecordInvalidationRequestSchema,
  RegisterArtifactRequestSchema,
  ResolveInvalidationRequestSchema,
  TransitionRequestSchema,
  type AuthorizationDecision,
  type ControlPlaneAuditRecord,
  type ControlPlanePrincipal,
  type InvestmentWorkflow,
} from '@/lib/control-plane/schema';

import {
  canAuthorizeFinancialAction,
  canCreateInvestmentWorkflow,
  canRecordMaterialInvalidation,
  canRegisterArtifact,
  canRequestTransition,
  canResolveMaterialInvalidation,
} from '@/lib/control-plane/permissions';

import {
  assertStateTransitionShape,
} from '@/lib/control-plane/state-machine';

import {
  evaluateWorkflowGates,
} from '@/lib/control-plane/gates';

import type {
  ControlPlaneStore,
} from '@/lib/control-plane/store';

import {
  IMMUTABLE_HISTORICAL_ARTIFACTS,
} from '@/lib/control-plane/spec';

function combineDecisions(
  ...decisions: AuthorizationDecision[]
): AuthorizationDecision {
  const missingRequirements =
    decisions.flatMap(
      (decision) =>
        decision.missingRequirements,
    );

  const denied = decisions.find(
    (decision) => !decision.allowed,
  );

  return denied
    ? {
        allowed: false,
        reason: denied.reason,
        missingRequirements,
      }
    : {
        allowed: true,
        reason: 'all_control_plane_checks_passed',
        missingRequirements: [],
      };
}

export class CompanyControlPlane {
  constructor(
    private readonly store: ControlPlaneStore,
    private readonly clock: () => string = () =>
      new Date().toISOString(),
  ) {}

  private auditId(
    requestId: string,
    suffix: string,
  ): string {
    return `cp-audit:${requestId}:${suffix}`;
  }

  private async audit(
    record: Omit<
      ControlPlaneAuditRecord,
      'at'
    > & {
      at?: string;
    },
  ): Promise<void> {
    await this.store.appendAudit({
      ...record,
      at: record.at ?? this.clock(),
    });
  }

  private async duplicateResult(
    requestId: string,
    workflowId: string,
    actor: ControlPlanePrincipal['actor'],
  ) {
    const workflow =
      await this.requireWorkflow(workflowId);

    await this.audit({
      auditId: this.auditId(
        requestId,
        'duplicate',
      ),
      requestId,
      actor,
      action: 'control_plane.request',
      outcome: 'duplicate',
      reason:
        'duplicate_request_ignored_idempotently',
      workflowId,
      workflowRevisionBefore:
        workflow.revision,
      workflowRevisionAfter:
        workflow.revision,
      metadata: {},
    });

    return {
      workflow,
      duplicate: true as const,
    };
  }

  private async requireWorkflow(
    workflowId: string,
  ): Promise<InvestmentWorkflow> {
    const workflow =
      await this.store.getWorkflow(
        workflowId,
      );

    if (!workflow) {
      throw new Error(
        `workflow_not_found:${workflowId}`,
      );
    }

    return workflow;
  }

  private assertExpectedRevision(
    workflow: InvestmentWorkflow,
    expectedRevision?: number,
  ): void {
    if (
      expectedRevision !== undefined &&
      workflow.revision !==
        expectedRevision
    ) {
      throw new Error(
        `workflow_revision_conflict:expected=${expectedRevision}:actual=${workflow.revision}`,
      );
    }
  }

  async createWorkflow(
    input: Parameters<
      typeof CreateWorkflowRequestSchema.parse
    >[0],
  ) {
    const request =
      CreateWorkflowRequestSchema.parse(input);

    if (
      await this.store.hasProcessedRequest(
        request.requestId,
      )
    ) {
      return this.duplicateResult(
        request.requestId,
        request.workflowId,
        request.principal.actor,
      );
    }

    const permission =
      canCreateInvestmentWorkflow(
        request.principal,
        request.responsibleResearchAgentId,
      );

    if (!permission.allowed) {
      await this.audit({
        auditId: this.auditId(
          request.requestId,
          'denied',
        ),
        requestId: request.requestId,
        actor: request.principal.actor,
        action: 'workflow.create',
        outcome: 'denied',
        reason: permission.reason,
        workflowId: request.workflowId,
        metadata: {},
      });

      throw new Error(permission.reason);
    }

    const now = this.clock();

    const workflow =
      InvestmentWorkflowSchema.parse({
        id: request.workflowId,
        state: 'DRAFT',
        revision: 0,
        createdBy:
          request.principal.actor,
        createdAt: now,
        updatedAt: now,
        responsibleResearchAgentId:
          request.responsibleResearchAgentId,
        assetRef: request.assetRef,
        artifacts: [],
        invalidations: [],
        metadata: request.metadata,
      });

    await this.store.createWorkflow(
      workflow,
    );

    await this.store.markProcessedRequest(
      request.requestId,
    );

    await this.audit({
      auditId: this.auditId(
        request.requestId,
        'created',
      ),
      requestId: request.requestId,
      actor: request.principal.actor,
      action: 'workflow.create',
      outcome: 'created',
      reason: request.reason,
      workflowId: workflow.id,
      workflowRevisionAfter:
        workflow.revision,
      metadata: {
        state: workflow.state,
      },
    });

    return {
      workflow,
      duplicate: false as const,
    };
  }

  async registerArtifact(
    input: Parameters<
      typeof RegisterArtifactRequestSchema.parse
    >[0],
  ) {
    const request =
      RegisterArtifactRequestSchema.parse(
        input,
      );

    if (
      await this.store.hasProcessedRequest(
        request.requestId,
      )
    ) {
      return this.duplicateResult(
        request.requestId,
        request.workflowId,
        request.principal.actor,
      );
    }

    let workflow =
      await this.requireWorkflow(
        request.workflowId,
      );

    this.assertExpectedRevision(
      workflow,
      request.expectedRevision,
    );

    if (
      request.artifact.workflowId !==
      workflow.id
    ) {
      throw new Error(
        'artifact_workflow_id_mismatch',
      );
    }

    if (
      request.artifact.createdBy.id !==
        request.principal.actor.id ||
      request.artifact.createdBy.kind !==
        request.principal.actor.kind
    ) {
      throw new Error(
        'artifact_creator_must_match_request_principal',
      );
    }

    const permission =
      canRegisterArtifact(
        request.principal,
        request.artifact.kind,
      );

    if (!permission.allowed) {
      throw new Error(permission.reason);
    }

    if (
      workflow.artifacts.some(
        (artifact) =>
          artifact.id ===
          request.artifact.id,
      )
    ) {
      throw new Error(
        `artifact_id_already_exists:${request.artifact.id}`,
      );
    }

    const now = this.clock();

    workflow = {
      ...workflow,
      revision: workflow.revision + 1,
      updatedAt: now,
      artifacts: [
        ...workflow.artifacts,
        request.artifact,
      ],
    };

    workflow =
      InvestmentWorkflowSchema.parse(
        workflow,
      );

    const saved =
      await this.store.replaceWorkflow({
        workflow,
        expectedRevision:
          workflow.revision - 1,
      });

    await this.store.markProcessedRequest(
      request.requestId,
    );

    await this.audit({
      auditId: this.auditId(
        request.requestId,
        'artifact',
      ),
      requestId: request.requestId,
      actor: request.principal.actor,
      action: 'workflow.register_artifact',
      outcome: 'recorded',
      reason: request.reason,
      workflowId: workflow.id,
      workflowRevisionBefore:
        workflow.revision - 1,
      workflowRevisionAfter:
        workflow.revision,
      metadata: {
        artifactId:
          request.artifact.id,
        artifactKind:
          request.artifact.kind,
        immutableHistoricalRecord:
          IMMUTABLE_HISTORICAL_ARTIFACTS.has(
            request.artifact.kind,
          ),
      },
    });

    return {
      workflow: saved,
      duplicate: false as const,
    };
  }

  async transition(
    input: Parameters<
      typeof TransitionRequestSchema.parse
    >[0],
  ) {
    const request =
      TransitionRequestSchema.parse(input);

    if (
      await this.store.hasProcessedRequest(
        request.requestId,
      )
    ) {
      return this.duplicateResult(
        request.requestId,
        request.workflowId,
        request.principal.actor,
      );
    }

    let workflow =
      await this.requireWorkflow(
        request.workflowId,
      );

    this.assertExpectedRevision(
      workflow,
      request.expectedRevision,
    );

    const decision = combineDecisions(
      assertStateTransitionShape(
        workflow,
        request.fromState,
        request.toState,
      ),
      canRequestTransition(
        request.principal,
        request.fromState,
      ),
      evaluateWorkflowGates(
        workflow,
        request.fromState,
        request.toState,
      ),
    );

    if (!decision.allowed) {
      await this.audit({
        auditId: this.auditId(
          request.requestId,
          'transition-denied',
        ),
        requestId: request.requestId,
        actor: request.principal.actor,
        action: 'workflow.transition',
        outcome: 'denied',
        reason: decision.reason,
        workflowId: workflow.id,
        workflowRevisionBefore:
          workflow.revision,
        workflowRevisionAfter:
          workflow.revision,
        metadata: {
          fromState: request.fromState,
          toState: request.toState,
          missingRequirements:
            decision.missingRequirements,
        },
      });

      throw new Error(
        [
          decision.reason,
          ...decision.missingRequirements,
        ].join('|'),
      );
    }

    const before = workflow.revision;
    const now = this.clock();

    workflow = {
      ...workflow,
      state: request.toState,
      revision: before + 1,
      updatedAt: now,
    };

    workflow =
      InvestmentWorkflowSchema.parse(
        workflow,
      );

    const saved =
      await this.store.replaceWorkflow({
        workflow,
        expectedRevision: before,
      });

    await this.store.markProcessedRequest(
      request.requestId,
    );

    await this.audit({
      auditId: this.auditId(
        request.requestId,
        'transitioned',
      ),
      requestId: request.requestId,
      actor: request.principal.actor,
      action: 'workflow.transition',
      outcome: 'transitioned',
      reason: request.reason,
      workflowId: workflow.id,
      workflowRevisionBefore: before,
      workflowRevisionAfter:
        workflow.revision,
      metadata: {
        fromState: request.fromState,
        toState: request.toState,
        transitionAuthority:
          'control_plane_only',
      },
    });

    return {
      workflow: saved,
      duplicate: false as const,
    };
  }

  async recordInvalidation(
    input: Parameters<
      typeof RecordInvalidationRequestSchema.parse
    >[0],
  ) {
    const request =
      RecordInvalidationRequestSchema.parse(
        input,
      );

    if (
      await this.store.hasProcessedRequest(
        request.requestId,
      )
    ) {
      return this.duplicateResult(
        request.requestId,
        request.workflowId,
        request.principal.actor,
      );
    }

    let workflow =
      await this.requireWorkflow(
        request.workflowId,
      );

    this.assertExpectedRevision(
      workflow,
      request.expectedRevision,
    );

    const permission =
      canRecordMaterialInvalidation(
        request.principal,
      );

    if (!permission.allowed) {
      throw new Error(permission.reason);
    }

    if (
      request.invalidation.workflowId !==
      workflow.id
    ) {
      throw new Error(
        'invalidation_workflow_id_mismatch',
      );
    }

    if (
      request.invalidation.recordedBy.id !==
        request.principal.actor.id ||
      request.invalidation.recordedBy.kind !==
        request.principal.actor.kind
    ) {
      throw new Error(
        'invalidation_recorder_must_match_request_principal',
      );
    }

    if (
      workflow.invalidations.some(
        (item) =>
          item.id ===
          request.invalidation.id,
      )
    ) {
      throw new Error(
        `invalidation_id_already_exists:${request.invalidation.id}`,
      );
    }

    const before = workflow.revision;

    workflow = {
      ...workflow,
      revision: before + 1,
      updatedAt: this.clock(),
      invalidations: [
        ...workflow.invalidations,
        request.invalidation,
      ],
    };

    workflow =
      InvestmentWorkflowSchema.parse(
        workflow,
      );

    const saved =
      await this.store.replaceWorkflow({
        workflow,
        expectedRevision: before,
      });

    await this.store.markProcessedRequest(
      request.requestId,
    );

    await this.audit({
      auditId: this.auditId(
        request.requestId,
        'invalidation',
      ),
      requestId: request.requestId,
      actor: request.principal.actor,
      action:
        'workflow.record_invalidation',
      outcome: 'recorded',
      reason: request.reason,
      workflowId: workflow.id,
      workflowRevisionBefore: before,
      workflowRevisionAfter:
        workflow.revision,
      metadata: {
        invalidationId:
          request.invalidation.id,
        invalidationKind:
          request.invalidation.kind,
      },
    });

    return {
      workflow: saved,
      duplicate: false as const,
    };
  }

  async resolveInvalidation(
    input: Parameters<
      typeof ResolveInvalidationRequestSchema.parse
    >[0],
  ) {
    const request =
      ResolveInvalidationRequestSchema.parse(
        input,
      );

    if (
      await this.store.hasProcessedRequest(
        request.requestId,
      )
    ) {
      return this.duplicateResult(
        request.requestId,
        request.workflowId,
        request.principal.actor,
      );
    }

    let workflow =
      await this.requireWorkflow(
        request.workflowId,
      );

    this.assertExpectedRevision(
      workflow,
      request.expectedRevision,
    );

    const permission =
      canResolveMaterialInvalidation(
        request.principal,
      );

    if (!permission.allowed) {
      throw new Error(permission.reason);
    }

    const target =
      workflow.invalidations.find(
        (item) =>
          item.id ===
          request.invalidationId,
      );

    if (!target) {
      throw new Error(
        `invalidation_not_found:${request.invalidationId}`,
      );
    }

    if (target.status === 'resolved') {
      throw new Error(
        `invalidation_already_resolved:${request.invalidationId}`,
      );
    }

    const before = workflow.revision;
    const now = this.clock();

    workflow = {
      ...workflow,
      revision: before + 1,
      updatedAt: now,
      invalidations:
        workflow.invalidations.map(
          (item) =>
            item.id ===
            request.invalidationId
              ? {
                  ...item,
                  status:
                    'resolved' as const,
                  resolvedBy:
                    request.principal.actor,
                  resolvedAt: now,
                  resolutionReason:
                    request.reason,
                }
              : item,
        ),
    };

    workflow =
      InvestmentWorkflowSchema.parse(
        workflow,
      );

    const saved =
      await this.store.replaceWorkflow({
        workflow,
        expectedRevision: before,
      });

    await this.store.markProcessedRequest(
      request.requestId,
    );

    await this.audit({
      auditId: this.auditId(
        request.requestId,
        'invalidation-resolved',
      ),
      requestId: request.requestId,
      actor: request.principal.actor,
      action:
        'workflow.resolve_invalidation',
      outcome: 'recorded',
      reason: request.reason,
      workflowId: workflow.id,
      workflowRevisionBefore: before,
      workflowRevisionAfter:
        workflow.revision,
      metadata: {
        invalidationId:
          request.invalidationId,
      },
    });

    return {
      workflow: saved,
      duplicate: false as const,
    };
  }

  async authorizeFinancialAction(
    input: Parameters<
      typeof FinancialActionRequestSchema.parse
    >[0],
  ) {
    const request =
      FinancialActionRequestSchema.parse(
        input,
      );

    const permission =
      canAuthorizeFinancialAction(
        request.principal,
        request.action,
      );

    await this.audit({
      auditId: this.auditId(
        request.requestId,
        permission.allowed
          ? 'financial-authorized'
          : 'financial-denied',
      ),
      requestId: request.requestId,
      actor: request.principal.actor,
      action:
        `financial.${request.action}`,
      outcome: permission.allowed
        ? 'authorized'
        : 'denied',
      reason: permission.reason,
      workflowId: request.workflowId,
      metadata: {
        financialAction:
          request.action,
      },
    });

    return permission;
  }

  async getWorkflow(
    workflowId: string,
  ) {
    return this.requireWorkflow(
      workflowId,
    );
  }

  async listAudit(
    workflowId?: string,
  ) {
    return this.store.listAudit(
      workflowId,
    );
  }
}
