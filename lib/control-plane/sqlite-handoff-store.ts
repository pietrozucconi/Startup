import {
  GovernedHandoffSchema,
  type GovernedHandoff,
  type GovernedHandoffInput,
} from '@/lib/control-plane/handoff-schema';

import type {
  GovernedHandoffStore,
} from '@/lib/control-plane/handoff-store';

import {
  computeRetryDelayMs,
} from '@/lib/control-plane/jobs';

import {
  SqliteReliableControlPlaneStore,
} from '@/lib/control-plane/sqlite-reliable-store';

const HANDOFF_DDL = `
CREATE TABLE IF NOT EXISTS cp_handoffs (
  handoff_id TEXT PRIMARY KEY,

  source_message_id TEXT NOT NULL,
  source_topic TEXT NOT NULL,

  workflow_id TEXT,
  state_at_event TEXT,

  kind TEXT NOT NULL,

  destination_kind TEXT NOT NULL,
  destination_id TEXT NOT NULL,

  action TEXT NOT NULL,
  summary TEXT NOT NULL,

  status TEXT NOT NULL,
  attempts INTEGER NOT NULL,

  created_at TEXT NOT NULL,
  available_at TEXT NOT NULL,

  retry_policy_json TEXT NOT NULL,

  lease_owner TEXT,
  lease_until TEXT,

  delivered_at TEXT,
  last_error TEXT,

  policy_evidence_json TEXT NOT NULL,
  payload_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS cp_handoffs_pending_idx
ON cp_handoffs(status, available_at, lease_until);

CREATE INDEX IF NOT EXISTS cp_handoffs_destination_idx
ON cp_handoffs(destination_kind, destination_id, status);

CREATE INDEX IF NOT EXISTS cp_handoffs_workflow_idx
ON cp_handoffs(workflow_id, created_at);
`;

type HandoffRow = {
  handoff_id: string;

  source_message_id: string;
  source_topic: string;

  workflow_id: string | null;
  state_at_event: string | null;

  kind: string;

  destination_kind: string;
  destination_id: string;

  action: string;
  summary: string;

  status: string;
  attempts: number;

  created_at: string;
  available_at: string;

  retry_policy_json: string;

  lease_owner: string | null;
  lease_until: string | null;

  delivered_at: string | null;
  last_error: string | null;

  policy_evidence_json: string;
  payload_json: string;
};

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

function rowToHandoff(
  row: HandoffRow,
): GovernedHandoff {
  return GovernedHandoffSchema.parse({
    handoffId: row.handoff_id,

    sourceMessageId:
      row.source_message_id,
    sourceTopic:
      row.source_topic,

    workflowId:
      row.workflow_id ?? undefined,
    stateAtEvent:
      row.state_at_event ?? undefined,

    kind: row.kind,

    destination: {
      kind:
        row.destination_kind,
      id:
        row.destination_id,
    },

    action: row.action,
    summary: row.summary,

    status: row.status,
    attempts: row.attempts,

    createdAt:
      row.created_at,
    availableAt:
      row.available_at,

    retryPolicy: parseJson(
      row.retry_policy_json,
    ),

    leaseOwner:
      row.lease_owner ?? undefined,
    leaseUntil:
      row.lease_until ?? undefined,

    deliveredAt:
      row.delivered_at ?? undefined,
    lastError:
      row.last_error ?? undefined,

    policyEvidence: parseJson(
      row.policy_evidence_json,
    ),
    payload: parseJson(
      row.payload_json,
    ),
  });
}

export class SqliteGovernedHandoffStore
  extends SqliteReliableControlPlaneStore
  implements GovernedHandoffStore
{
  constructor(dbPath: string) {
    super(dbPath);

    this.db.exec(
      HANDOFF_DDL,
    );
  }

  enqueueHandoffsIdempotent(
    handoffInputs: GovernedHandoffInput[],
  ): GovernedHandoff[] {
    const handoffs =
      handoffInputs.map((handoff) =>
        GovernedHandoffSchema.parse(
          handoff,
        ),
      );

    const transaction =
      this.db.transaction(() => {
        const insert = this.db.prepare(
          `INSERT OR IGNORE INTO cp_handoffs
           (
             handoff_id,
             source_message_id,
             source_topic,
             workflow_id,
             state_at_event,
             kind,
             destination_kind,
             destination_id,
             action,
             summary,
             status,
             attempts,
             created_at,
             available_at,
             retry_policy_json,
             lease_owner,
             lease_until,
             delivered_at,
             last_error,
             policy_evidence_json,
             payload_json
           )
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        );

        const read = this.db.prepare(
          `SELECT *
           FROM cp_handoffs
           WHERE handoff_id = ?`,
        );

        const stored:
          GovernedHandoff[] = [];

        for (const handoff of handoffs) {
          insert.run(
            handoff.handoffId,
            handoff.sourceMessageId,
            handoff.sourceTopic,
            handoff.workflowId ?? null,
            handoff.stateAtEvent ?? null,
            handoff.kind,
            handoff.destination.kind,
            handoff.destination.id,
            handoff.action,
            handoff.summary,
            handoff.status,
            handoff.attempts,
            handoff.createdAt,
            handoff.availableAt,
            JSON.stringify(
              handoff.retryPolicy,
            ),
            handoff.leaseOwner ?? null,
            handoff.leaseUntil ?? null,
            handoff.deliveredAt ?? null,
            handoff.lastError ?? null,
            JSON.stringify(
              handoff.policyEvidence,
            ),
            JSON.stringify(
              handoff.payload,
            ),
          );

          stored.push(
            rowToHandoff(
              read.get(
                handoff.handoffId,
              ) as HandoffRow,
            ),
          );
        }

        return stored;
      });

    return transaction();
  }

  listHandoffs(input: {
    workflowId?: string;
    destinationKind?: GovernedHandoff['destination']['kind'];
    destinationId?: string;
    status?: GovernedHandoff['status'];
  } = {}): GovernedHandoff[] {
    const conditions: string[] = [];
    const params: string[] = [];

    if (input.workflowId) {
      conditions.push(
        'workflow_id = ?',
      );
      params.push(
        input.workflowId,
      );
    }

    if (input.destinationKind) {
      conditions.push(
        'destination_kind = ?',
      );
      params.push(
        input.destinationKind,
      );
    }

    if (input.destinationId) {
      conditions.push(
        'destination_id = ?',
      );
      params.push(
        input.destinationId,
      );
    }

    if (input.status) {
      conditions.push(
        'status = ?',
      );
      params.push(
        input.status,
      );
    }

    const where =
      conditions.length > 0
        ? `WHERE ${conditions.join(
            ' AND ',
          )}`
        : '';

    const rows = this.db
      .prepare(
        `SELECT *
         FROM cp_handoffs
         ${where}
         ORDER BY created_at, rowid`,
      )
      .all(...params) as HandoffRow[];

    return rows.map(
      rowToHandoff,
    );
  }

  claimHandoffs(input: {
    workerId: string;
    now: string;
    limit: number;
    leaseMs: number;
  }): GovernedHandoff[] {
    if (input.limit <= 0) {
      throw new Error(
        'handoff_claim_limit_must_be_positive',
      );
    }

    if (input.leaseMs <= 0) {
      throw new Error(
        'handoff_claim_lease_must_be_positive',
      );
    }

    const leaseUntil = addMs(
      input.now,
      input.leaseMs,
    );

    const transaction =
      this.db.transaction(() => {
        const candidates = this.db
          .prepare(
            `SELECT handoff_id
             FROM cp_handoffs
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
          handoff_id: string;
        }>;

        const update = this.db.prepare(
          `UPDATE cp_handoffs
           SET status = 'in_flight',
               attempts = attempts + 1,
               lease_owner = ?,
               lease_until = ?
           WHERE handoff_id = ?
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
           FROM cp_handoffs
           WHERE handoff_id = ?`,
        );

        const claimed:
          GovernedHandoff[] = [];

        for (const candidate of candidates) {
          const result = update.run(
            input.workerId,
            leaseUntil,
            candidate.handoff_id,
            input.now,
          );

          if (result.changes !== 1) {
            continue;
          }

          claimed.push(
            rowToHandoff(
              read.get(
                candidate.handoff_id,
              ) as HandoffRow,
            ),
          );
        }

        return claimed;
      });

    return transaction();
  }

  completeHandoff(input: {
    handoffId: string;
    workerId: string;
    deliveredAt: string;
  }): GovernedHandoff {
    const result = this.db
      .prepare(
        `UPDATE cp_handoffs
         SET status = 'delivered',
             delivered_at = ?,
             lease_owner = NULL,
             lease_until = NULL,
             last_error = NULL
         WHERE handoff_id = ?
           AND status = 'in_flight'
           AND lease_owner = ?`,
      )
      .run(
        input.deliveredAt,
        input.handoffId,
        input.workerId,
      );

    if (result.changes !== 1) {
      throw new Error(
        `handoff_complete_lease_mismatch:${input.handoffId}`,
      );
    }

    return this.readHandoff(
      input.handoffId,
    );
  }

  failHandoff(input: {
    handoffId: string;
    workerId: string;
    failedAt: string;
    error: string;
  }): GovernedHandoff {
    const transaction =
      this.db.transaction(() => {
        const current =
          this.readHandoff(
            input.handoffId,
          );

        if (
          current.status !==
            'in_flight' ||
          current.leaseOwner !==
            input.workerId
        ) {
          throw new Error(
            `handoff_fail_lease_mismatch:${input.handoffId}`,
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

        const nextAvailableAt =
          addMs(
            input.failedAt,
            delayMs,
          );

        this.db
          .prepare(
            `UPDATE cp_handoffs
             SET status = ?,
                 available_at = ?,
                 lease_owner = NULL,
                 lease_until = NULL,
                 last_error = ?
             WHERE handoff_id = ?`,
          )
          .run(
            exhausted
              ? 'dead_letter'
              : 'pending',
            exhausted
              ? current.availableAt
              : nextAvailableAt,
            input.error,
            input.handoffId,
          );

        return this.readHandoff(
          input.handoffId,
        );
      });

    return transaction();
  }

  cancelHandoff(input: {
    handoffId: string;
    reason: string;
  }): GovernedHandoff {
    const result = this.db
      .prepare(
        `UPDATE cp_handoffs
         SET status = 'cancelled',
             lease_owner = NULL,
             lease_until = NULL,
             last_error = ?
         WHERE handoff_id = ?
           AND status IN ('pending', 'in_flight')`,
      )
      .run(
        input.reason,
        input.handoffId,
      );

    if (result.changes !== 1) {
      throw new Error(
        `handoff_not_cancellable:${input.handoffId}`,
      );
    }

    return this.readHandoff(
      input.handoffId,
    );
  }

  private readHandoff(
    handoffId: string,
  ): GovernedHandoff {
    const row = this.db
      .prepare(
        `SELECT *
         FROM cp_handoffs
         WHERE handoff_id = ?`,
      )
      .get(
        handoffId,
      ) as
      | HandoffRow
      | undefined;

    if (!row) {
      throw new Error(
        `handoff_not_found:${handoffId}`,
      );
    }

    return rowToHandoff(row);
  }
}
