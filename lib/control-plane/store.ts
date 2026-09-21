import {
  ControlPlaneAuditRecordSchema,
  InvestmentWorkflowSchema,
  type ControlPlaneAuditRecord,
  type InvestmentWorkflow,
} from '@/lib/control-plane/schema';

export interface ControlPlaneStore {
  getWorkflow(
    workflowId: string,
  ): Promise<InvestmentWorkflow | null>;

  createWorkflow(
    workflow: InvestmentWorkflow,
  ): Promise<InvestmentWorkflow>;

  replaceWorkflow(input: {
    workflow: InvestmentWorkflow;
    expectedRevision: number;
  }): Promise<InvestmentWorkflow>;

  hasProcessedRequest(
    requestId: string,
  ): Promise<boolean>;

  markProcessedRequest(
    requestId: string,
  ): Promise<void>;

  appendAudit(
    record: ControlPlaneAuditRecord,
  ): Promise<void>;

  listAudit(
    workflowId?: string,
  ): Promise<ControlPlaneAuditRecord[]>;
}

export class InMemoryControlPlaneStore
  implements ControlPlaneStore
{
  private readonly workflows =
    new Map<string, InvestmentWorkflow>();

  private readonly processedRequests =
    new Set<string>();

  private readonly audit: ControlPlaneAuditRecord[] =
    [];

  async getWorkflow(
    workflowId: string,
  ): Promise<InvestmentWorkflow | null> {
    const workflow =
      this.workflows.get(workflowId);

    return workflow
      ? structuredClone(workflow)
      : null;
  }

  async createWorkflow(
    workflowInput: InvestmentWorkflow,
  ): Promise<InvestmentWorkflow> {
    const workflow =
      InvestmentWorkflowSchema.parse(
        workflowInput,
      );

    if (this.workflows.has(workflow.id)) {
      throw new Error(
        `workflow_already_exists:${workflow.id}`,
      );
    }

    this.workflows.set(
      workflow.id,
      structuredClone(workflow),
    );

    return structuredClone(workflow);
  }

  async replaceWorkflow(input: {
    workflow: InvestmentWorkflow;
    expectedRevision: number;
  }): Promise<InvestmentWorkflow> {
    const current =
      this.workflows.get(input.workflow.id);

    if (!current) {
      throw new Error(
        `workflow_not_found:${input.workflow.id}`,
      );
    }

    if (
      current.revision !==
      input.expectedRevision
    ) {
      throw new Error(
        `workflow_revision_conflict:expected=${input.expectedRevision}:actual=${current.revision}`,
      );
    }

    const parsed =
      InvestmentWorkflowSchema.parse(
        input.workflow,
      );

    this.workflows.set(
      parsed.id,
      structuredClone(parsed),
    );

    return structuredClone(parsed);
  }

  async hasProcessedRequest(
    requestId: string,
  ): Promise<boolean> {
    return this.processedRequests.has(
      requestId,
    );
  }

  async markProcessedRequest(
    requestId: string,
  ): Promise<void> {
    this.processedRequests.add(requestId);
  }

  async appendAudit(
    record: ControlPlaneAuditRecord,
  ): Promise<void> {
    this.audit.push(
      ControlPlaneAuditRecordSchema.parse(
        record,
      ),
    );
  }

  async listAudit(
    workflowId?: string,
  ): Promise<ControlPlaneAuditRecord[]> {
    const records = workflowId
      ? this.audit.filter(
          (record) =>
            record.workflowId === workflowId,
        )
      : this.audit;

    return structuredClone(records);
  }
}
