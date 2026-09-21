import {
  AtomicControlPlaneCommitSchema,
  type AtomicControlPlaneCommitInput,
  type AtomicControlPlaneCommitResult,
  type AtomicControlPlaneStore,
} from '@/lib/control-plane/atomic-store';

import {
  InvestmentWorkflowSchema,
  type InvestmentWorkflow,
} from '@/lib/control-plane/schema';

import {
  ControlPlaneCommandRecordSchema,
  type ControlPlaneCommandRecord,
} from '@/lib/control-plane/durable-schema';

import {
  SqliteControlPlaneStore,
} from '@/lib/control-plane/sqlite-store';

type CommandRow = {
  command_id: string;
  request_id: string;
  workflow_id: string | null;
  command_type: string;
  actor_json: string;
  received_at: string;
  outcome: string;
  reason: string;
  payload_json: string;
};

type WorkflowRow = {
  snapshot_json: string;
};

function parseJson<T>(
  value: string,
): T {
  return JSON.parse(value) as T;
}

function rowToCommand(
  row: CommandRow,
): ControlPlaneCommandRecord {
  return ControlPlaneCommandRecordSchema.parse({
    commandId: row.command_id,
    requestId: row.request_id,
    workflowId: row.workflow_id ?? undefined,
    commandType: row.command_type,
    actor: parseJson(row.actor_json),
    receivedAt: row.received_at,
    outcome: row.outcome,
    reason: row.reason,
    payload: parseJson(row.payload_json),
  });
}

export class SqliteAtomicControlPlaneStore
  extends SqliteControlPlaneStore
  implements AtomicControlPlaneStore
{
  async getCommandByRequestId(
    requestId: string,
  ): Promise<ControlPlaneCommandRecord | null> {
    const row = this.db
      .prepare(
        `SELECT *
         FROM cp_commands
         WHERE request_id = ?`,
      )
      .get(requestId) as
      | CommandRow
      | undefined;

    return row
      ? rowToCommand(row)
      : null;
  }

  async commitAtomic(
    inputRaw: AtomicControlPlaneCommitInput,
  ): Promise<AtomicControlPlaneCommitResult> {
    const input =
      AtomicControlPlaneCommitSchema.parse(
        inputRaw,
      );

    const transaction =
      this.db.transaction(() => {
        const existingCommand = this.db
          .prepare(
            `SELECT *
             FROM cp_commands
             WHERE request_id = ?`,
          )
          .get(
            input.command.requestId,
          ) as
          | CommandRow
          | undefined;

        if (existingCommand) {
          const command =
            rowToCommand(existingCommand);

          const workflow =
            command.workflowId
              ? this.readWorkflowSync(
                  command.workflowId,
                )
              : undefined;

          return {
            duplicate: true,
            workflow,
            command,
          };
        }

        const legacyProcessed = this.db
          .prepare(
            `SELECT 1 AS found
             FROM cp_processed_requests
             WHERE request_id = ?`,
          )
          .get(
            input.command.requestId,
          ) as
          | { found: number }
          | undefined;

        if (legacyProcessed?.found === 1) {
          const workflow =
            input.command.workflowId
              ? this.readWorkflowSync(
                  input.command.workflowId,
                )
              : undefined;

          return {
            duplicate: true,
            workflow,
          };
        }

        this.insertCommand(input.command);

        let workflow:
          | InvestmentWorkflow
          | undefined;

        if (input.mutation.kind === 'create') {
          workflow =
            this.createWorkflowSync(
              input.mutation.workflow,
            );
        } else if (
          input.mutation.kind === 'replace'
        ) {
          workflow =
            this.replaceWorkflowSync({
              workflow:
                input.mutation.workflow,
              expectedRevision:
                input.mutation.expectedRevision,
            });
        } else if (
          input.command.workflowId
        ) {
          workflow = this.readWorkflowSync(
            input.command.workflowId,
          );
        }

        this.db
          .prepare(
            `INSERT INTO cp_processed_requests
             (request_id, processed_at)
             VALUES (?, ?)`,
          )
          .run(
            input.command.requestId,
            input.processedAt,
          );

        this.db
          .prepare(
            `INSERT INTO cp_audit
             (
               audit_id,
               request_id,
               workflow_id,
               at,
               action,
               outcome,
               record_json
             )
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            input.audit.auditId,
            input.audit.requestId,
            input.audit.workflowId ?? null,
            input.audit.at,
            input.audit.action,
            input.audit.outcome,
            JSON.stringify(input.audit),
          );

        for (const event of input.events) {
          this.db
            .prepare(
              `INSERT INTO cp_domain_events
               (
                 event_id,
                 request_id,
                 workflow_id,
                 sequence,
                 event_type,
                 actor_json,
                 occurred_at,
                 payload_json
               )
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              event.eventId,
              event.requestId,
              event.workflowId ?? null,
              event.sequence ?? null,
              event.eventType,
              JSON.stringify(event.actor),
              event.occurredAt,
              JSON.stringify(event.payload),
            );
        }

        for (const message of input.outbox) {
          this.db
            .prepare(
              `INSERT INTO cp_outbox
               (
                 message_id,
                 topic,
                 partition_key,
                 workflow_id,
                 status,
                 attempts,
                 created_at,
                 available_at,
                 retry_policy_json,
                 lease_owner,
                 lease_until,
                 last_error,
                 published_at,
                 payload_json
               )
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            )
            .run(
              message.messageId,
              message.topic,
              message.partitionKey,
              message.workflowId ?? null,
              message.status,
              message.attempts,
              message.createdAt,
              message.availableAt,
              JSON.stringify(
                message.retryPolicy,
              ),
              message.leaseOwner ?? null,
              message.leaseUntil ?? null,
              message.lastError ?? null,
              message.publishedAt ?? null,
              JSON.stringify(message.payload),
            );
        }

        return {
          duplicate: false,
          workflow,
          command: input.command,
        };
      });

    return transaction();
  }

  private readWorkflowSync(
    workflowId: string,
  ): InvestmentWorkflow | undefined {
    const row = this.db
      .prepare(
        `SELECT snapshot_json
         FROM cp_workflows
         WHERE id = ?`,
      )
      .get(workflowId) as
      | WorkflowRow
      | undefined;

    return row
      ? InvestmentWorkflowSchema.parse(
          parseJson(row.snapshot_json),
        )
      : undefined;
  }

  private createWorkflowSync(
    workflowInput: InvestmentWorkflow,
  ): InvestmentWorkflow {
    const workflow =
      InvestmentWorkflowSchema.parse(
        workflowInput,
      );

    try {
      this.db
        .prepare(
          `INSERT INTO cp_workflows
           (
             id,
             revision,
             state,
             snapshot_json,
             created_at,
             updated_at
           )
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          workflow.id,
          workflow.revision,
          workflow.state,
          JSON.stringify(workflow),
          workflow.createdAt,
          workflow.updatedAt,
        );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes(
          'UNIQUE constraint failed',
        )
      ) {
        throw new Error(
          `workflow_already_exists:${workflow.id}`,
        );
      }

      throw error;
    }

    return workflow;
  }

  private replaceWorkflowSync(input: {
    workflow: InvestmentWorkflow;
    expectedRevision: number;
  }): InvestmentWorkflow {
    const workflow =
      InvestmentWorkflowSchema.parse(
        input.workflow,
      );

    const result = this.db
      .prepare(
        `UPDATE cp_workflows
         SET revision = ?,
             state = ?,
             snapshot_json = ?,
             updated_at = ?
         WHERE id = ?
           AND revision = ?`,
      )
      .run(
        workflow.revision,
        workflow.state,
        JSON.stringify(workflow),
        workflow.updatedAt,
        workflow.id,
        input.expectedRevision,
      );

    if (result.changes === 1) {
      return workflow;
    }

    const current = this.db
      .prepare(
        `SELECT revision
         FROM cp_workflows
         WHERE id = ?`,
      )
      .get(workflow.id) as
      | { revision: number }
      | undefined;

    if (!current) {
      throw new Error(
        `workflow_not_found:${workflow.id}`,
      );
    }

    throw new Error(
      `workflow_revision_conflict:expected=${input.expectedRevision}:actual=${current.revision}`,
    );
  }

  private insertCommand(
    command: ControlPlaneCommandRecord,
  ): void {
    this.db
      .prepare(
        `INSERT INTO cp_commands
         (
           command_id,
           request_id,
           workflow_id,
           command_type,
           actor_json,
           received_at,
           outcome,
           reason,
           payload_json
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        command.commandId,
        command.requestId,
        command.workflowId ?? null,
        command.commandType,
        JSON.stringify(command.actor),
        command.receivedAt,
        command.outcome,
        command.reason,
        JSON.stringify(command.payload),
      );
  }
}
