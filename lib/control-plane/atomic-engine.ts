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

import type {
  AtomicControlPlaneCommitInput,
  AtomicControlPlaneStore,
} from '@/lib/control-plane/atomic-store';

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

import {
  IMMUTABLE_HISTORICAL_ARTIFACTS,
} from '@/lib/control-plane/spec';

const DEFAULT_OUTBOX_RETRY_POLICY = {
  maxAttempts: 5,
  initialDelayMs: 1_000,
  backoffMultiplier: 2,
  maxDelayMs: 60_000,
  timeoutMs: 30_000,
} as const;

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

export class AtomicCompanyControlPlane {
  constructor(
    private readonly store: AtomicControlPlaneStore,
    private readonly clock: () => string = () =>
      new Date().toISOString(),
  ) {}

  private auditId(
    requestId: string,
    suffix: string,
  ): string {
    return `cp-audit:${requestId}:${suffix}`;
  }

  private commandId(
    requestId: string,
  ): string {
    return `cp-command:${requestId}`;
  }

  private eventId(
    requestId: string,
  ): string {
    return `cp-event:${requestId}`;
  }

  private outboxId(
    requestId: string,
  ): string {
    return `cp-outbox:${requestId}`;
  }

  private async auditDenied(
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

  private async duplicateWorkflowResult(
    requestId: string,
    workflowId: string,
  ) {
    const command =
      await this.store.getCommandByRequestId(
        requestId,
      );

    if (!command) {
      return null;
    }

    const workflow =
      await this.requireWorkflow(workflowId);

    return {
      workflow,
      duplicate: true as const,
    };
  }

  private buildAtomicCommit(input: {
    requestId: string;
    workflowId?: string;
    commandType:
      | 'create_workflow'
      | 'register_artifact'
      | 'transition_workflow'
      | 'record_invalidation'
      | 'resolve_invalidation'
      | 'authorize_financial_action';
    principal: ControlPlanePrincipal;
    reason: string;
    commandPayload: Record<string, unknown>;
    mutation: AtomicControlPlaneCommitInput['mutation'];
    audit: ControlPlaneAuditRecord;
    eventType:
      | 'workflow_created'
      | 'artifact_registered'
      | 'workflow_transitioned'
      | 'invalidation_recorded'
      | 'invalidation_resolved'
      | 'financial_action_authorized'
      | 'financial_action_denied';
    eventPayload: Record<string, unknown>;
    sequence?: number;
    outboxTopic: string;
    commandOutcome?: 'succeeded' | 'denied';
    at: string;
  }): AtomicControlPlaneCommitInput {
    const eventId =
      this.eventId(input.requestId);

    return {
      command: {
        commandId:
          this.commandId(input.requestId),
        requestId: input.requestId,
        workflowId: input.workflowId,
        commandType: input.commandType,
        actor: input.principal.actor,
        receivedAt: input.at,
        outcome:
          input.commandOutcome ?? 'succeeded',
        reason: input.reason,
        payload: input.commandPayload,
      },
      mutation: input.mutation,
      processedAt: input.at,
      audit: input.audit,
      events: [
        {
          eventId,
          requestId: input.requestId,
          workflowId: input.workflowId,
          sequence: input.sequence,
          eventType: input.eventType,
          actor: input.principal.actor,
          occurredAt: input.at,
          payload: input.eventPayload,
        },
      ],
      outbox: [
        {
          messageId:
            this.outboxId(input.requestId),
          topic: input.outboxTopic,
          partitionKey:
            input.workflowId ??
            input.requestId,
          workflowId: input.workflowId,
          createdAt: input.at,
          availableAt: input.at,
          retryPolicy:
            DEFAULT_OUTBOX_RETRY_POLICY,
          payload: {
            eventId,
            eventType: input.eventType,
            ...input.eventPayload,
          },
        },
      ],
    };
  }

  async createWorkflow(
    input: Parameters<
      typeof CreateWorkflowRequestSchema.parse
    >[0],
  ) {
    const request =
      CreateWorkflowRequestSchema.parse(input);

    const duplicate =
      await this.duplicateWorkflowResult(
        request.requestId,
        request.workflowId,
      );

    if (duplicate) {
      return duplicate;
    }

    const permission =
      canCreateInvestmentWorkflow(
        request.principal,
        request.responsibleResearchAgentId,
      );

    if (!permission.allowed) {
      await this.auditDenied({
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

    const result =
      await this.store.commitAtomic(
        this.buildAtomicCommit({
          requestId: request.requestId,
          workflowId: workflow.id,
          commandType: 'create_workflow',
          principal: request.principal,
          reason: request.reason,
          commandPayload: {
            responsibleResearchAgentId:
              request.responsibleResearchAgentId,
            assetRef: request.assetRef,
          },
          mutation: {
            kind: 'create',
            workflow,
          },
          audit: {
            auditId: this.auditId(
              request.requestId,
              'created',
            ),
            requestId: request.requestId,
            at: now,
            actor: request.principal.actor,
            action: 'workflow.create',
            outcome: 'created',
            reason: request.reason,
            workflowId: workflow.id,
            workflowRevisionAfter: 0,
            metadata: {
              state: workflow.state,
              persistence:
                'atomic_unit_of_work',
            },
          },
          eventType: 'workflow_created',
          eventPayload: {
            state: workflow.state,
          },
          sequence: 0,
          outboxTopic:
            'control-plane.workflow.created',
          at: now,
        }),
      );

    if (!result.workflow) {
      throw new Error(
        'atomic_create_missing_workflow',
      );
    }

    return {
      workflow: result.workflow,
      duplicate: result.duplicate,
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

    const duplicate =
      await this.duplicateWorkflowResult(
        request.requestId,
        request.workflowId,
      );

    if (duplicate) {
      return duplicate;
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

    const before = workflow.revision;
    const now = this.clock();

    workflow =
      InvestmentWorkflowSchema.parse({
        ...workflow,
        revision: before + 1,
        updatedAt: now,
        artifacts: [
          ...workflow.artifacts,
          request.artifact,
        ],
      });

    const result =
      await this.store.commitAtomic(
        this.buildAtomicCommit({
          requestId: request.requestId,
          workflowId: workflow.id,
          commandType: 'register_artifact',
          principal: request.principal,
          reason: request.reason,
          commandPayload: {
            artifactId:
              request.artifact.id,
            artifactKind:
              request.artifact.kind,
          },
          mutation: {
            kind: 'replace',
            workflow,
            expectedRevision: before,
          },
          audit: {
            auditId: this.auditId(
              request.requestId,
              'artifact',
            ),
            requestId: request.requestId,
            at: now,
            actor: request.principal.actor,
            action:
              'workflow.register_artifact',
            outcome: 'recorded',
            reason: request.reason,
            workflowId: workflow.id,
            workflowRevisionBefore: before,
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
              persistence:
                'atomic_unit_of_work',
            },
          },
          eventType: 'artifact_registered',
          eventPayload: {
            artifactId:
              request.artifact.id,
            artifactKind:
              request.artifact.kind,
          },
          sequence: workflow.revision,
          outboxTopic:
            'control-plane.artifact.registered',
          at: now,
        }),
      );

    if (!result.workflow) {
      throw new Error(
        'atomic_artifact_missing_workflow',
      );
    }

    return {
      workflow: result.workflow,
      duplicate: result.duplicate,
    };
  }

  async transition(
    input: Parameters<
      typeof TransitionRequestSchema.parse
    >[0],
  ) {
    const request =
      TransitionRequestSchema.parse(input);

    const duplicate =
      await this.duplicateWorkflowResult(
        request.requestId,
        request.workflowId,
      );

    if (duplicate) {
      return duplicate;
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
      await this.auditDenied({
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

    workflow =
      InvestmentWorkflowSchema.parse({
        ...workflow,
        state: request.toState,
        revision: before + 1,
        updatedAt: now,
      });

    const result =
      await this.store.commitAtomic(
        this.buildAtomicCommit({
          requestId: request.requestId,
          workflowId: workflow.id,
          commandType: 'transition_workflow',
          principal: request.principal,
          reason: request.reason,
          commandPayload: {
            fromState: request.fromState,
            toState: request.toState,
          },
          mutation: {
            kind: 'replace',
            workflow,
            expectedRevision: before,
          },
          audit: {
            auditId: this.auditId(
              request.requestId,
              'transitioned',
            ),
            requestId: request.requestId,
            at: now,
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
              persistence:
                'atomic_unit_of_work',
            },
          },
          eventType:
            'workflow_transitioned',
          eventPayload: {
            fromState: request.fromState,
            toState: request.toState,
          },
          sequence: workflow.revision,
          outboxTopic:
            'control-plane.workflow.transitioned',
          at: now,
        }),
      );

    if (!result.workflow) {
      throw new Error(
        'atomic_transition_missing_workflow',
      );
    }

    return {
      workflow: result.workflow,
      duplicate: result.duplicate,
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

    const duplicate =
      await this.duplicateWorkflowResult(
        request.requestId,
        request.workflowId,
      );

    if (duplicate) {
      return duplicate;
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
    const now = this.clock();

    workflow =
      InvestmentWorkflowSchema.parse({
        ...workflow,
        revision: before + 1,
        updatedAt: now,
        invalidations: [
          ...workflow.invalidations,
          request.invalidation,
        ],
      });

    const result =
      await this.store.commitAtomic(
        this.buildAtomicCommit({
          requestId: request.requestId,
          workflowId: workflow.id,
          commandType:
            'record_invalidation',
          principal: request.principal,
          reason: request.reason,
          commandPayload: {
            invalidationId:
              request.invalidation.id,
            invalidationKind:
              request.invalidation.kind,
          },
          mutation: {
            kind: 'replace',
            workflow,
            expectedRevision: before,
          },
          audit: {
            auditId: this.auditId(
              request.requestId,
              'invalidation',
            ),
            requestId: request.requestId,
            at: now,
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
              persistence:
                'atomic_unit_of_work',
            },
          },
          eventType:
            'invalidation_recorded',
          eventPayload: {
            invalidationId:
              request.invalidation.id,
            invalidationKind:
              request.invalidation.kind,
          },
          sequence: workflow.revision,
          outboxTopic:
            'control-plane.invalidation.recorded',
          at: now,
        }),
      );

    if (!result.workflow) {
      throw new Error(
        'atomic_invalidation_missing_workflow',
      );
    }

    return {
      workflow: result.workflow,
      duplicate: result.duplicate,
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

    const duplicate =
      await this.duplicateWorkflowResult(
        request.requestId,
        request.workflowId,
      );

    if (duplicate) {
      return duplicate;
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

    workflow =
      InvestmentWorkflowSchema.parse({
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
      });

    const result =
      await this.store.commitAtomic(
        this.buildAtomicCommit({
          requestId: request.requestId,
          workflowId: workflow.id,
          commandType:
            'resolve_invalidation',
          principal: request.principal,
          reason: request.reason,
          commandPayload: {
            invalidationId:
              request.invalidationId,
          },
          mutation: {
            kind: 'replace',
            workflow,
            expectedRevision: before,
          },
          audit: {
            auditId: this.auditId(
              request.requestId,
              'invalidation-resolved',
            ),
            requestId: request.requestId,
            at: now,
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
              persistence:
                'atomic_unit_of_work',
            },
          },
          eventType:
            'invalidation_resolved',
          eventPayload: {
            invalidationId:
              request.invalidationId,
          },
          sequence: workflow.revision,
          outboxTopic:
            'control-plane.invalidation.resolved',
          at: now,
        }),
      );

    if (!result.workflow) {
      throw new Error(
        'atomic_resolution_missing_workflow',
      );
    }

    return {
      workflow: result.workflow,
      duplicate: result.duplicate,
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

    const existing =
      await this.store.getCommandByRequestId(
        request.requestId,
      );

    if (existing) {
      return {
        allowed:
          existing.outcome === 'succeeded',
        reason: existing.reason,
        missingRequirements: [],
      };
    }

    const permission =
      canAuthorizeFinancialAction(
        request.principal,
        request.action,
      );

    const now = this.clock();
    const eventType = permission.allowed
      ? 'financial_action_authorized' as const
      : 'financial_action_denied' as const;

    await this.store.commitAtomic(
      this.buildAtomicCommit({
        requestId: request.requestId,
        workflowId: request.workflowId,
        commandType:
          'authorize_financial_action',
        principal: request.principal,
        reason: permission.reason,
        commandPayload: {
          financialAction:
            request.action,
          requestedReason:
            request.reason,
        },
        mutation: {
          kind: 'none',
        },
        audit: {
          auditId: this.auditId(
            request.requestId,
            permission.allowed
              ? 'financial-authorized'
              : 'financial-denied',
          ),
          requestId: request.requestId,
          at: now,
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
            persistence:
              'atomic_unit_of_work',
          },
        },
        eventType,
        eventPayload: {
          financialAction:
            request.action,
          allowed: permission.allowed,
        },
        outboxTopic: permission.allowed
          ? 'control-plane.financial-action.authorized'
          : 'control-plane.financial-action.denied',
        commandOutcome: permission.allowed
          ? 'succeeded'
          : 'denied',
        at: now,
      }),
    );

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
