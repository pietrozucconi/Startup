import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

import {
  ControlPlaneAuditRecordSchema,
  InvestmentWorkflowSchema,
  type ControlPlaneAuditRecord,
  type InvestmentWorkflow,
} from '@/lib/control-plane/schema';

import {
  ClaimBatchSchema,
  ControlPlaneCommandRecordSchema,
  ControlPlaneDomainEventSchema,
  ControlPlaneOutboxMessageSchema,
  DurableScheduledJobSchema,
  type ClaimBatchInput,
  type ControlPlaneCommandRecord,
  type ControlPlaneDomainEvent,
  type ControlPlaneOutboxMessage,
  type DurableScheduledJob,
  type ControlPlaneOutboxMessageInput,
  type DurableScheduledJobInput,
} from '@/lib/control-plane/durable-schema';

import {
  computeRetryDelayMs,
} from '@/lib/control-plane/jobs';

import type {
  ControlPlaneStore,
} from '@/lib/control-plane/store';

const DDL = `
CREATE TABLE IF NOT EXISTS cp_workflows (
  id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL,
  state TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cp_processed_requests (
  request_id TEXT PRIMARY KEY,
  processed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cp_audit (
  audit_id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  workflow_id TEXT,
  at TEXT NOT NULL,
  action TEXT NOT NULL,
  outcome TEXT NOT NULL,
  record_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS cp_audit_workflow_at_idx
ON cp_audit(workflow_id, at);

CREATE TABLE IF NOT EXISTS cp_commands (
  command_id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL UNIQUE,
  workflow_id TEXT,
  command_type TEXT NOT NULL,
  actor_json TEXT NOT NULL,
  received_at TEXT NOT NULL,
  outcome TEXT NOT NULL,
  reason TEXT NOT NULL,
  payload_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS cp_commands_workflow_received_idx
ON cp_commands(workflow_id, received_at);

CREATE TABLE IF NOT EXISTS cp_domain_events (
  event_id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  workflow_id TEXT,
  sequence INTEGER,
  event_type TEXT NOT NULL,
  actor_json TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  UNIQUE(workflow_id, sequence)
);

CREATE INDEX IF NOT EXISTS cp_domain_events_workflow_sequence_idx
ON cp_domain_events(workflow_id, sequence);

CREATE TABLE IF NOT EXISTS cp_outbox (
  message_id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,
  partition_key TEXT NOT NULL,
  workflow_id TEXT,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  available_at TEXT NOT NULL,
  retry_policy_json TEXT NOT NULL,
  lease_owner TEXT,
  lease_until TEXT,
  last_error TEXT,
  published_at TEXT,
  payload_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS cp_outbox_delivery_idx
ON cp_outbox(status, available_at, lease_until);

CREATE TABLE IF NOT EXISTS cp_jobs (
  job_id TEXT PRIMARY KEY,
  workflow_id TEXT,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  attempts INTEGER NOT NULL,
  run_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  retry_policy_json TEXT NOT NULL,
  lease_owner TEXT,
  lease_until TEXT,
  last_error TEXT,
  payload_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS cp_jobs_due_idx
ON cp_jobs(status, run_at, lease_until);
`;

function ensureParentDirectory(
  dbPath: string,
): void {
  if (dbPath === ':memory:') {
    return;
  }

  fs.mkdirSync(
    path.dirname(dbPath),
    { recursive: true },
  );
}

function parseJson<T>(
  value: string,
): T {
  return JSON.parse(value) as T;
}

function addMs(
  iso: string,
  milliseconds: number,
): string {
  return new Date(
    Date.parse(iso) + milliseconds,
  ).toISOString();
}

type WorkflowRow = {
  snapshot_json: string;
};

type AuditRow = {
  record_json: string;
};

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

type DomainEventRow = {
  event_id: string;
  request_id: string;
  workflow_id: string | null;
  sequence: number | null;
  event_type: string;
  actor_json: string;
  occurred_at: string;
  payload_json: string;
};

type OutboxRow = {
  message_id: string;
  topic: string;
  partition_key: string;
  workflow_id: string | null;
  status: string;
  attempts: number;
  created_at: string;
  available_at: string;
  retry_policy_json: string;
  lease_owner: string | null;
  lease_until: string | null;
  last_error: string | null;
  published_at: string | null;
  payload_json: string;
};

type JobRow = {
  job_id: string;
  workflow_id: string | null;
  kind: string;
  status: string;
  attempts: number;
  run_at: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  retry_policy_json: string;
  lease_owner: string | null;
  lease_until: string | null;
  last_error: string | null;
  payload_json: string;
};

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

function rowToDomainEvent(
  row: DomainEventRow,
): ControlPlaneDomainEvent {
  return ControlPlaneDomainEventSchema.parse({
    eventId: row.event_id,
    requestId: row.request_id,
    workflowId: row.workflow_id ?? undefined,
    sequence: row.sequence ?? undefined,
    eventType: row.event_type,
    actor: parseJson(row.actor_json),
    occurredAt: row.occurred_at,
    payload: parseJson(row.payload_json),
  });
}

function rowToOutbox(
  row: OutboxRow,
): ControlPlaneOutboxMessage {
  return ControlPlaneOutboxMessageSchema.parse({
    messageId: row.message_id,
    topic: row.topic,
    partitionKey: row.partition_key,
    workflowId: row.workflow_id ?? undefined,
    status: row.status,
    attempts: row.attempts,
    createdAt: row.created_at,
    availableAt: row.available_at,
    retryPolicy: parseJson(row.retry_policy_json),
    leaseOwner: row.lease_owner ?? undefined,
    leaseUntil: row.lease_until ?? undefined,
    lastError: row.last_error ?? undefined,
    publishedAt: row.published_at ?? undefined,
    payload: parseJson(row.payload_json),
  });
}

function rowToJob(
  row: JobRow,
): DurableScheduledJob {
  return DurableScheduledJobSchema.parse({
    jobId: row.job_id,
    workflowId: row.workflow_id ?? undefined,
    kind: row.kind,
    status: row.status,
    attempts: row.attempts,
    runAt: row.run_at,
    createdAt: row.created_at,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    retryPolicy: parseJson(row.retry_policy_json),
    leaseOwner: row.lease_owner ?? undefined,
    leaseUntil: row.lease_until ?? undefined,
    lastError: row.last_error ?? undefined,
    payload: parseJson(row.payload_json),
  });
}

export class SqliteControlPlaneStore
  implements ControlPlaneStore
{
  protected readonly db: InstanceType<
    typeof Database
  >;

  constructor(dbPath: string) {
    ensureParentDirectory(dbPath);

    this.db = new Database(dbPath);

    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');

    this.db.exec(DDL);
  }

  close(): void {
    this.db.close();
  }

  async getWorkflow(
    workflowId: string,
  ): Promise<InvestmentWorkflow | null> {
    const row = this.db
      .prepare(
        'SELECT snapshot_json FROM cp_workflows WHERE id = ?',
      )
      .get(workflowId) as
      | WorkflowRow
      | undefined;

    if (!row) {
      return null;
    }

    return InvestmentWorkflowSchema.parse(
      parseJson(row.snapshot_json),
    );
  }

  async createWorkflow(
    workflowInput: InvestmentWorkflow,
  ): Promise<InvestmentWorkflow> {
    const workflow =
      InvestmentWorkflowSchema.parse(
        workflowInput,
      );

    try {
      this.db
        .prepare(
          `INSERT INTO cp_workflows
           (id, revision, state, snapshot_json, created_at, updated_at)
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

    return structuredClone(workflow);
  }

  async replaceWorkflow(input: {
    workflow: InvestmentWorkflow;
    expectedRevision: number;
  }): Promise<InvestmentWorkflow> {
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
      return structuredClone(workflow);
    }

    const current = this.db
      .prepare(
        'SELECT revision FROM cp_workflows WHERE id = ?',
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

  async hasProcessedRequest(
    requestId: string,
  ): Promise<boolean> {
    const row = this.db
      .prepare(
        'SELECT 1 AS found FROM cp_processed_requests WHERE request_id = ?',
      )
      .get(requestId) as
      | { found: number }
      | undefined;

    return row?.found === 1;
  }

  async markProcessedRequest(
    requestId: string,
  ): Promise<void> {
    this.db
      .prepare(
        `INSERT OR IGNORE INTO cp_processed_requests
         (request_id, processed_at)
         VALUES (?, ?)`,
      )
      .run(
        requestId,
        new Date().toISOString(),
      );
  }

  async appendAudit(
    recordInput: ControlPlaneAuditRecord,
  ): Promise<void> {
    const record =
      ControlPlaneAuditRecordSchema.parse(
        recordInput,
      );

    this.db
      .prepare(
        `INSERT INTO cp_audit
         (audit_id, request_id, workflow_id, at, action, outcome, record_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.auditId,
        record.requestId,
        record.workflowId ?? null,
        record.at,
        record.action,
        record.outcome,
        JSON.stringify(record),
      );
  }

  async listAudit(
    workflowId?: string,
  ): Promise<ControlPlaneAuditRecord[]> {
    const rows = workflowId
      ? (this.db
          .prepare(
            `SELECT record_json
             FROM cp_audit
             WHERE workflow_id = ?
             ORDER BY at, rowid`,
          )
          .all(workflowId) as AuditRow[])
      : (this.db
          .prepare(
            `SELECT record_json
             FROM cp_audit
             ORDER BY at, rowid`,
          )
          .all() as AuditRow[]);

    return rows.map((row) =>
      ControlPlaneAuditRecordSchema.parse(
        parseJson(row.record_json),
      ),
    );
  }

  appendCommand(
    recordInput: ControlPlaneCommandRecord,
  ): void {
    const record =
      ControlPlaneCommandRecordSchema.parse(
        recordInput,
      );

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
        record.commandId,
        record.requestId,
        record.workflowId ?? null,
        record.commandType,
        JSON.stringify(record.actor),
        record.receivedAt,
        record.outcome,
        record.reason,
        JSON.stringify(record.payload),
      );
  }

  listCommands(
    workflowId?: string,
  ): ControlPlaneCommandRecord[] {
    const rows = workflowId
      ? (this.db
          .prepare(
            `SELECT *
             FROM cp_commands
             WHERE workflow_id = ?
             ORDER BY received_at, rowid`,
          )
          .all(workflowId) as CommandRow[])
      : (this.db
          .prepare(
            `SELECT *
             FROM cp_commands
             ORDER BY received_at, rowid`,
          )
          .all() as CommandRow[]);

    return rows.map(rowToCommand);
  }

  appendDomainEvent(
    eventInput: ControlPlaneDomainEvent,
  ): void {
    const event =
      ControlPlaneDomainEventSchema.parse(
        eventInput,
      );

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

  listDomainEvents(
    workflowId?: string,
  ): ControlPlaneDomainEvent[] {
    const rows = workflowId
      ? (this.db
          .prepare(
            `SELECT *
             FROM cp_domain_events
             WHERE workflow_id = ?
             ORDER BY sequence, occurred_at, rowid`,
          )
          .all(workflowId) as DomainEventRow[])
      : (this.db
          .prepare(
            `SELECT *
             FROM cp_domain_events
             ORDER BY occurred_at, rowid`,
          )
          .all() as DomainEventRow[]);

    return rows.map(rowToDomainEvent);
  }

  enqueueOutbox(
    messageInput: ControlPlaneOutboxMessageInput,
  ): void {
    const message =
      ControlPlaneOutboxMessageSchema.parse(
        messageInput,
      );

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
        JSON.stringify(message.retryPolicy),
        message.leaseOwner ?? null,
        message.leaseUntil ?? null,
        message.lastError ?? null,
        message.publishedAt ?? null,
        JSON.stringify(message.payload),
      );
  }

  listOutbox(): ControlPlaneOutboxMessage[] {
    const rows = this.db
      .prepare(
        `SELECT *
         FROM cp_outbox
         ORDER BY created_at, rowid`,
      )
      .all() as OutboxRow[];

    return rows.map(rowToOutbox);
  }

  claimOutbox(
    inputRaw: ClaimBatchInput,
  ): ControlPlaneOutboxMessage[] {
    const input =
      ClaimBatchSchema.parse(inputRaw);

    const leaseUntil = addMs(
      input.now,
      input.leaseMs,
    );

    const transaction =
      this.db.transaction(() => {
        const candidates = this.db
          .prepare(
            `SELECT message_id
             FROM cp_outbox
             WHERE available_at <= ?
               AND (
                 status = 'pending'
                 OR (
                   status = 'in_flight'
                   AND lease_until IS NOT NULL
                   AND lease_until <= ?
                 )
               )
             ORDER BY available_at, created_at, rowid
             LIMIT ?`,
          )
          .all(
            input.now,
            input.now,
            input.limit,
          ) as Array<{
          message_id: string;
        }>;

        const claimed: ControlPlaneOutboxMessage[] =
          [];

        const claim = this.db.prepare(
          `UPDATE cp_outbox
           SET status = 'in_flight',
               attempts = attempts + 1,
               lease_owner = ?,
               lease_until = ?
           WHERE message_id = ?
             AND (
               status = 'pending'
               OR (
                 status = 'in_flight'
                 AND lease_until IS NOT NULL
                 AND lease_until <= ?
               )
             )`,
        );

        const read = this.db.prepare(
          `SELECT *
           FROM cp_outbox
           WHERE message_id = ?`,
        );

        for (const candidate of candidates) {
          const result = claim.run(
            input.workerId,
            leaseUntil,
            candidate.message_id,
            input.now,
          );

          if (result.changes !== 1) {
            continue;
          }

          const row = read.get(
            candidate.message_id,
          ) as OutboxRow;

          claimed.push(
            rowToOutbox(row),
          );
        }

        return claimed;
      });

    return transaction();
  }

  acknowledgeOutbox(input: {
    messageId: string;
    workerId: string;
    publishedAt: string;
  }): void {
    const result = this.db
      .prepare(
        `UPDATE cp_outbox
         SET status = 'published',
             published_at = ?,
             lease_owner = NULL,
             lease_until = NULL,
             last_error = NULL
         WHERE message_id = ?
           AND status = 'in_flight'
           AND lease_owner = ?`,
      )
      .run(
        input.publishedAt,
        input.messageId,
        input.workerId,
      );

    if (result.changes !== 1) {
      throw new Error(
        `outbox_ack_lease_mismatch:${input.messageId}`,
      );
    }
  }

  failOutbox(input: {
    messageId: string;
    workerId: string;
    failedAt: string;
    error: string;
  }): ControlPlaneOutboxMessage {
    const transaction =
      this.db.transaction(() => {
        const row = this.db
          .prepare(
            `SELECT *
             FROM cp_outbox
             WHERE message_id = ?`,
          )
          .get(input.messageId) as
          | OutboxRow
          | undefined;

        if (!row) {
          throw new Error(
            `outbox_message_not_found:${input.messageId}`,
          );
        }

        const current =
          rowToOutbox(row);

        if (
          current.status !== 'in_flight' ||
          current.leaseOwner !==
            input.workerId
        ) {
          throw new Error(
            `outbox_fail_lease_mismatch:${input.messageId}`,
          );
        }

        const exhausted =
          current.attempts >=
          current.retryPolicy.maxAttempts;

        const delayMs =
          computeRetryDelayMs(
            current.retryPolicy,
            current.attempts,
          );

        const nextAvailableAt = addMs(
          input.failedAt,
          delayMs,
        );

        this.db
          .prepare(
            `UPDATE cp_outbox
             SET status = ?,
                 available_at = ?,
                 lease_owner = NULL,
                 lease_until = NULL,
                 last_error = ?
             WHERE message_id = ?`,
          )
          .run(
            exhausted
              ? 'dead_letter'
              : 'pending',
            exhausted
              ? current.availableAt
              : nextAvailableAt,
            input.error,
            input.messageId,
          );

        const updated = this.db
          .prepare(
            `SELECT *
             FROM cp_outbox
             WHERE message_id = ?`,
          )
          .get(
            input.messageId,
          ) as OutboxRow;

        return rowToOutbox(updated);
      });

    return transaction();
  }

  scheduleJob(
    jobInput: DurableScheduledJobInput,
  ): void {
    const job =
      DurableScheduledJobSchema.parse(
        jobInput,
      );

    this.db
      .prepare(
        `INSERT INTO cp_jobs
         (
           job_id,
           workflow_id,
           kind,
           status,
           attempts,
           run_at,
           created_at,
           started_at,
           completed_at,
           retry_policy_json,
           lease_owner,
           lease_until,
           last_error,
           payload_json
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        job.jobId,
        job.workflowId ?? null,
        job.kind,
        job.status,
        job.attempts,
        job.runAt,
        job.createdAt,
        job.startedAt ?? null,
        job.completedAt ?? null,
        JSON.stringify(job.retryPolicy),
        job.leaseOwner ?? null,
        job.leaseUntil ?? null,
        job.lastError ?? null,
        JSON.stringify(job.payload),
      );
  }

  listJobs(): DurableScheduledJob[] {
    const rows = this.db
      .prepare(
        `SELECT *
         FROM cp_jobs
         ORDER BY run_at, rowid`,
      )
      .all() as JobRow[];

    return rows.map(rowToJob);
  }

  claimDueJobs(
    inputRaw: ClaimBatchInput,
  ): DurableScheduledJob[] {
    const input =
      ClaimBatchSchema.parse(inputRaw);

    const leaseUntil = addMs(
      input.now,
      input.leaseMs,
    );

    const transaction =
      this.db.transaction(() => {
        const candidates = this.db
          .prepare(
            `SELECT job_id
             FROM cp_jobs
             WHERE run_at <= ?
               AND (
                 status = 'scheduled'
                 OR (
                   status = 'running'
                   AND lease_until IS NOT NULL
                   AND lease_until <= ?
                 )
               )
             ORDER BY run_at, created_at, rowid
             LIMIT ?`,
          )
          .all(
            input.now,
            input.now,
            input.limit,
          ) as Array<{
          job_id: string;
        }>;

        const claim = this.db.prepare(
          `UPDATE cp_jobs
           SET status = 'running',
               attempts = attempts + 1,
               started_at = ?,
               lease_owner = ?,
               lease_until = ?
           WHERE job_id = ?
             AND (
               status = 'scheduled'
               OR (
                 status = 'running'
                 AND lease_until IS NOT NULL
                 AND lease_until <= ?
               )
             )`,
        );

        const read = this.db.prepare(
          `SELECT *
           FROM cp_jobs
           WHERE job_id = ?`,
        );

        const claimed: DurableScheduledJob[] =
          [];

        for (const candidate of candidates) {
          const result = claim.run(
            input.now,
            input.workerId,
            leaseUntil,
            candidate.job_id,
            input.now,
          );

          if (result.changes !== 1) {
            continue;
          }

          claimed.push(
            rowToJob(
              read.get(
                candidate.job_id,
              ) as JobRow,
            ),
          );
        }

        return claimed;
      });

    return transaction();
  }

  completeJob(input: {
    jobId: string;
    workerId: string;
    completedAt: string;
  }): void {
    const result = this.db
      .prepare(
        `UPDATE cp_jobs
         SET status = 'succeeded',
             completed_at = ?,
             lease_owner = NULL,
             lease_until = NULL,
             last_error = NULL
         WHERE job_id = ?
           AND status = 'running'
           AND lease_owner = ?`,
      )
      .run(
        input.completedAt,
        input.jobId,
        input.workerId,
      );

    if (result.changes !== 1) {
      throw new Error(
        `job_complete_lease_mismatch:${input.jobId}`,
      );
    }
  }

  failJob(input: {
    jobId: string;
    workerId: string;
    failedAt: string;
    error: string;
  }): DurableScheduledJob {
    const transaction =
      this.db.transaction(() => {
        const row = this.db
          .prepare(
            `SELECT *
             FROM cp_jobs
             WHERE job_id = ?`,
          )
          .get(input.jobId) as
          | JobRow
          | undefined;

        if (!row) {
          throw new Error(
            `job_not_found:${input.jobId}`,
          );
        }

        const current =
          rowToJob(row);

        if (
          current.status !== 'running' ||
          current.leaseOwner !==
            input.workerId
        ) {
          throw new Error(
            `job_fail_lease_mismatch:${input.jobId}`,
          );
        }

        const exhausted =
          current.attempts >=
          current.retryPolicy.maxAttempts;

        const delayMs =
          computeRetryDelayMs(
            current.retryPolicy,
            current.attempts,
          );

        const nextRunAt = addMs(
          input.failedAt,
          delayMs,
        );

        this.db
          .prepare(
            `UPDATE cp_jobs
             SET status = ?,
                 run_at = ?,
                 lease_owner = NULL,
                 lease_until = NULL,
                 last_error = ?
             WHERE job_id = ?`,
          )
          .run(
            exhausted
              ? 'dead_letter'
              : 'scheduled',
            exhausted
              ? current.runAt
              : nextRunAt,
            input.error,
            input.jobId,
          );

        return rowToJob(
          this.db
            .prepare(
              `SELECT *
               FROM cp_jobs
               WHERE job_id = ?`,
            )
            .get(
              input.jobId,
            ) as JobRow,
        );
      });

    return transaction();
  }

  cancelJob(input: {
    jobId: string;
  }): void {
    const result = this.db
      .prepare(
        `UPDATE cp_jobs
         SET status = 'cancelled',
             lease_owner = NULL,
             lease_until = NULL
         WHERE job_id = ?
           AND status IN ('scheduled', 'running')`,
      )
      .run(input.jobId);

    if (result.changes !== 1) {
      throw new Error(
        `job_not_cancellable:${input.jobId}`,
      );
    }
  }
}
