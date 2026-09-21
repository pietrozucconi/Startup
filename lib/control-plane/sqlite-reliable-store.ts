import {
  ConsumerDeliveryClaimResultSchema,
  ConsumerDeliveryReceiptSchema,
  DeadLetterRedriveRecordSchema,
  type ConsumerDeliveryClaimResult,
  type ConsumerDeliveryReceipt,
  type DeadLetterRedriveRecord,
} from '@/lib/control-plane/consumer-schema';

import type {
  ReliableConsumerStore,
} from '@/lib/control-plane/reliable-store';

import {
  SqliteAtomicControlPlaneStore,
} from '@/lib/control-plane/sqlite-atomic-store';

const RELIABLE_CONSUMER_DDL = `
CREATE TABLE IF NOT EXISTS cp_consumer_deliveries (
  consumer_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  topic TEXT NOT NULL,

  status TEXT NOT NULL,
  attempts INTEGER NOT NULL,

  first_received_at TEXT NOT NULL,
  last_attempt_at TEXT NOT NULL,
  completed_at TEXT,

  lease_owner TEXT,
  lease_until TEXT,

  last_error TEXT,
  result_json TEXT NOT NULL,

  PRIMARY KEY (consumer_id, message_id)
);

CREATE INDEX IF NOT EXISTS cp_consumer_deliveries_status_idx
ON cp_consumer_deliveries(consumer_id, status, lease_until);

CREATE TABLE IF NOT EXISTS cp_dead_letter_redrives (
  redrive_id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  requested_by_json TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  reason TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS cp_dead_letter_redrives_message_idx
ON cp_dead_letter_redrives(message_id, requested_at);
`;

type DeliveryRow = {
  consumer_id: string;
  message_id: string;
  topic: string;

  status: string;
  attempts: number;

  first_received_at: string;
  last_attempt_at: string;
  completed_at: string | null;

  lease_owner: string | null;
  lease_until: string | null;

  last_error: string | null;
  result_json: string;
};

type RedriveRow = {
  redrive_id: string;
  message_id: string;
  requested_by_json: string;
  requested_at: string;
  reason: string;
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

function rowToDelivery(
  row: DeliveryRow,
): ConsumerDeliveryReceipt {
  return ConsumerDeliveryReceiptSchema.parse({
    consumerId: row.consumer_id,
    messageId: row.message_id,
    topic: row.topic,

    status: row.status,
    attempts: row.attempts,

    firstReceivedAt:
      row.first_received_at,
    lastAttemptAt:
      row.last_attempt_at,

    completedAt:
      row.completed_at ?? undefined,

    leaseOwner:
      row.lease_owner ?? undefined,
    leaseUntil:
      row.lease_until ?? undefined,

    lastError:
      row.last_error ?? undefined,

    result: parseJson(
      row.result_json,
    ),
  });
}

function rowToRedrive(
  row: RedriveRow,
): DeadLetterRedriveRecord {
  return DeadLetterRedriveRecordSchema.parse({
    redriveId: row.redrive_id,
    messageId: row.message_id,
    requestedBy: parseJson(
      row.requested_by_json,
    ),
    requestedAt: row.requested_at,
    reason: row.reason,
  });
}

export class SqliteReliableControlPlaneStore
  extends SqliteAtomicControlPlaneStore
  implements ReliableConsumerStore
{
  constructor(dbPath: string) {
    super(dbPath);

    this.db.exec(
      RELIABLE_CONSUMER_DDL,
    );
  }

  claimConsumerDelivery(input: {
    consumerId: string;
    messageId: string;
    topic: string;
    workerId: string;
    now: string;
    leaseMs: number;
  }): ConsumerDeliveryClaimResult {
    if (input.leaseMs <= 0) {
      throw new Error(
        'consumer_delivery_lease_must_be_positive',
      );
    }

    const leaseUntil = addMs(
      input.now,
      input.leaseMs,
    );

    const transaction =
      this.db.transaction(() => {
        const existing = this.db
          .prepare(
            `SELECT *
             FROM cp_consumer_deliveries
             WHERE consumer_id = ?
               AND message_id = ?`,
          )
          .get(
            input.consumerId,
            input.messageId,
          ) as
          | DeliveryRow
          | undefined;

        if (!existing) {
          this.db
            .prepare(
              `INSERT INTO cp_consumer_deliveries
               (
                 consumer_id,
                 message_id,
                 topic,
                 status,
                 attempts,
                 first_received_at,
                 last_attempt_at,
                 completed_at,
                 lease_owner,
                 lease_until,
                 last_error,
                 result_json
               )
               VALUES (?, ?, ?, 'processing', 1, ?, ?, NULL, ?, ?, NULL, '{}')`,
            )
            .run(
              input.consumerId,
              input.messageId,
              input.topic,
              input.now,
              input.now,
              input.workerId,
              leaseUntil,
            );

          const inserted = this.db
            .prepare(
              `SELECT *
               FROM cp_consumer_deliveries
               WHERE consumer_id = ?
                 AND message_id = ?`,
            )
            .get(
              input.consumerId,
              input.messageId,
            ) as DeliveryRow;

          return ConsumerDeliveryClaimResultSchema.parse({
            outcome: 'claimed',
            receipt: rowToDelivery(
              inserted,
            ),
          });
        }

        const receipt =
          rowToDelivery(existing);

        if (
          receipt.status ===
          'succeeded'
        ) {
          return ConsumerDeliveryClaimResultSchema.parse({
            outcome:
              'already_succeeded',
            receipt,
          });
        }

        const leaseStillActive =
          receipt.leaseUntil !== undefined &&
          Date.parse(
            receipt.leaseUntil,
          ) > Date.parse(input.now);

        if (leaseStillActive) {
          return ConsumerDeliveryClaimResultSchema.parse({
            outcome: 'busy',
            receipt,
          });
        }

        const result = this.db
          .prepare(
            `UPDATE cp_consumer_deliveries
             SET attempts = attempts + 1,
                 last_attempt_at = ?,
                 lease_owner = ?,
                 lease_until = ?,
                 last_error = NULL
             WHERE consumer_id = ?
               AND message_id = ?
               AND status = 'processing'
               AND (
                 lease_until IS NULL
                 OR lease_until <= ?
               )`,
          )
          .run(
            input.now,
            input.workerId,
            leaseUntil,
            input.consumerId,
            input.messageId,
            input.now,
          );

        if (result.changes !== 1) {
          const current = this.db
            .prepare(
              `SELECT *
               FROM cp_consumer_deliveries
               WHERE consumer_id = ?
                 AND message_id = ?`,
            )
            .get(
              input.consumerId,
              input.messageId,
            ) as DeliveryRow;

          return ConsumerDeliveryClaimResultSchema.parse({
            outcome: 'busy',
            receipt:
              rowToDelivery(current),
          });
        }

        const claimed = this.db
          .prepare(
            `SELECT *
             FROM cp_consumer_deliveries
             WHERE consumer_id = ?
               AND message_id = ?`,
          )
          .get(
            input.consumerId,
            input.messageId,
          ) as DeliveryRow;

        return ConsumerDeliveryClaimResultSchema.parse({
          outcome: 'claimed',
          receipt:
            rowToDelivery(claimed),
        });
      });

    return transaction();
  }

  completeConsumerDelivery(input: {
    consumerId: string;
    messageId: string;
    workerId: string;
    completedAt: string;
    result?: Record<string, unknown>;
  }): ConsumerDeliveryReceipt {
    const result = this.db
      .prepare(
        `UPDATE cp_consumer_deliveries
         SET status = 'succeeded',
             completed_at = ?,
             lease_owner = NULL,
             lease_until = NULL,
             last_error = NULL,
             result_json = ?
         WHERE consumer_id = ?
           AND message_id = ?
           AND status = 'processing'
           AND lease_owner = ?`,
      )
      .run(
        input.completedAt,
        JSON.stringify(
          input.result ?? {},
        ),
        input.consumerId,
        input.messageId,
        input.workerId,
      );

    if (result.changes !== 1) {
      throw new Error(
        `consumer_delivery_complete_lease_mismatch:${input.consumerId}:${input.messageId}`,
      );
    }

    const row = this.db
      .prepare(
        `SELECT *
         FROM cp_consumer_deliveries
         WHERE consumer_id = ?
           AND message_id = ?`,
      )
      .get(
        input.consumerId,
        input.messageId,
      ) as DeliveryRow;

    return rowToDelivery(row);
  }

  failConsumerDelivery(input: {
    consumerId: string;
    messageId: string;
    workerId: string;
    failedAt: string;
    error: string;
  }): ConsumerDeliveryReceipt {
    const result = this.db
      .prepare(
        `UPDATE cp_consumer_deliveries
         SET last_attempt_at = ?,
             lease_owner = NULL,
             lease_until = NULL,
             last_error = ?
         WHERE consumer_id = ?
           AND message_id = ?
           AND status = 'processing'
           AND lease_owner = ?`,
      )
      .run(
        input.failedAt,
        input.error,
        input.consumerId,
        input.messageId,
        input.workerId,
      );

    if (result.changes !== 1) {
      throw new Error(
        `consumer_delivery_fail_lease_mismatch:${input.consumerId}:${input.messageId}`,
      );
    }

    const row = this.db
      .prepare(
        `SELECT *
         FROM cp_consumer_deliveries
         WHERE consumer_id = ?
           AND message_id = ?`,
      )
      .get(
        input.consumerId,
        input.messageId,
      ) as DeliveryRow;

    return rowToDelivery(row);
  }

  getConsumerDeliveryReceipt(input: {
    consumerId: string;
    messageId: string;
  }): ConsumerDeliveryReceipt | null {
    const row = this.db
      .prepare(
        `SELECT *
         FROM cp_consumer_deliveries
         WHERE consumer_id = ?
           AND message_id = ?`,
      )
      .get(
        input.consumerId,
        input.messageId,
      ) as
      | DeliveryRow
      | undefined;

    return row
      ? rowToDelivery(row)
      : null;
  }

  listConsumerDeliveryReceipts(
    consumerId?: string,
  ): ConsumerDeliveryReceipt[] {
    const rows = consumerId
      ? (this.db
          .prepare(
            `SELECT *
             FROM cp_consumer_deliveries
             WHERE consumer_id = ?
             ORDER BY first_received_at, rowid`,
          )
          .all(
            consumerId,
          ) as DeliveryRow[])
      : (this.db
          .prepare(
            `SELECT *
             FROM cp_consumer_deliveries
             ORDER BY first_received_at, rowid`,
          )
          .all() as DeliveryRow[]);

    return rows.map(
      rowToDelivery,
    );
  }

  redriveDeadLetter(
    recordInput: DeadLetterRedriveRecord,
    availableAt: string,
  ): void {
    const record =
      DeadLetterRedriveRecordSchema.parse(
        recordInput,
      );

    const transaction =
      this.db.transaction(() => {
        const current = this.db
          .prepare(
            `SELECT status
             FROM cp_outbox
             WHERE message_id = ?`,
          )
          .get(
            record.messageId,
          ) as
          | { status: string }
          | undefined;

        if (!current) {
          throw new Error(
            `outbox_message_not_found:${record.messageId}`,
          );
        }

        if (
          current.status !==
          'dead_letter'
        ) {
          throw new Error(
            `outbox_message_not_dead_letter:${record.messageId}`,
          );
        }

        this.db
          .prepare(
            `INSERT INTO cp_dead_letter_redrives
             (
               redrive_id,
               message_id,
               requested_by_json,
               requested_at,
               reason
             )
             VALUES (?, ?, ?, ?, ?)`,
          )
          .run(
            record.redriveId,
            record.messageId,
            JSON.stringify(
              record.requestedBy,
            ),
            record.requestedAt,
            record.reason,
          );

        this.db
          .prepare(
            `UPDATE cp_outbox
             SET status = 'pending',
                 attempts = 0,
                 available_at = ?,
                 lease_owner = NULL,
                 lease_until = NULL,
                 last_error = NULL,
                 published_at = NULL
             WHERE message_id = ?
               AND status = 'dead_letter'`,
          )
          .run(
            availableAt,
            record.messageId,
          );
      });

    transaction();
  }

  listDeadLetterRedrives(
    messageId?: string,
  ): DeadLetterRedriveRecord[] {
    const rows = messageId
      ? (this.db
          .prepare(
            `SELECT *
             FROM cp_dead_letter_redrives
             WHERE message_id = ?
             ORDER BY requested_at, rowid`,
          )
          .all(
            messageId,
          ) as RedriveRow[])
      : (this.db
          .prepare(
            `SELECT *
             FROM cp_dead_letter_redrives
             ORDER BY requested_at, rowid`,
          )
          .all() as RedriveRow[]);

    return rows.map(
      rowToRedrive,
    );
  }
}
