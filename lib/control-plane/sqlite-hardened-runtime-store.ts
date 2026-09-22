import { createHash } from 'node:crypto';

import {
  BrainMutationProposalSchema,
  type BrainMutationProposal,
} from '@/lib/brain/gateway/schema';

import {
  AgentExecutionRunSchema,
  DurableBrainMutationProposalSchema,
  RuntimeObservabilityEventSchema,
  RuntimeWorkerRecordSchema,
  type AgentExecutionRun,
  type DurableBrainMutationProposal,
  type DurableBrainProposalStatus,
  type RuntimeObservabilityEvent,
  type RuntimeWorkerRecord,
} from '@/lib/control-plane/hardened-runtime-schema';

import type {
  HardenedRuntimeStore,
} from '@/lib/control-plane/hardened-runtime-store';

import {
  SqliteInternalRuntimeStore,
} from '@/lib/control-plane/sqlite-runtime-store';

const HARDENED_RUNTIME_DDL = `
CREATE TABLE IF NOT EXISTS cp_runtime_workers (
  worker_id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  last_heartbeat_at TEXT NOT NULL,
  stopped_at TEXT,
  metadata_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS cp_runtime_workers_status_idx
ON cp_runtime_workers(status, last_heartbeat_at);

CREATE INDEX IF NOT EXISTS cp_runtime_workers_agent_idx
ON cp_runtime_workers(agent_id, status);

CREATE TABLE IF NOT EXISTS cp_agent_execution_runs (
  run_id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  handoff_id TEXT NOT NULL,
  workflow_id TEXT,
  agent_id TEXT NOT NULL,
  worker_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  executor_id TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  duration_ms INTEGER,
  model TEXT,
  finish_reason TEXT,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cached_input_tokens INTEGER NOT NULL,
  reasoning_tokens INTEGER NOT NULL,
  tool_call_count INTEGER NOT NULL,
  tool_failure_count INTEGER NOT NULL,
  estimated_cost_usd REAL,
  error TEXT,
  metadata_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS cp_agent_execution_runs_agent_idx
ON cp_agent_execution_runs(agent_id, started_at);

CREATE INDEX IF NOT EXISTS cp_agent_execution_runs_worker_idx
ON cp_agent_execution_runs(worker_id, started_at);

CREATE INDEX IF NOT EXISTS cp_agent_execution_runs_task_idx
ON cp_agent_execution_runs(task_id, started_at);

CREATE TABLE IF NOT EXISTS cp_runtime_observability (
  event_id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  at TEXT NOT NULL,
  worker_id TEXT,
  agent_id TEXT,
  task_id TEXT,
  run_id TEXT,
  workflow_id TEXT,
  proposal_id TEXT,
  payload_json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS cp_runtime_observability_kind_idx
ON cp_runtime_observability(kind, at);

CREATE INDEX IF NOT EXISTS cp_runtime_observability_run_idx
ON cp_runtime_observability(run_id, at);

CREATE INDEX IF NOT EXISTS cp_runtime_observability_worker_idx
ON cp_runtime_observability(worker_id, at);

CREATE TABLE IF NOT EXISTS cp_brain_mutation_proposals (
  proposal_id TEXT PRIMARY KEY,
  handoff_id TEXT NOT NULL UNIQUE,
  request_id TEXT NOT NULL UNIQUE,
  proposal_digest TEXT NOT NULL,
  status TEXT NOT NULL,
  proposal_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  graph_revision INTEGER,
  last_error TEXT
);

CREATE INDEX IF NOT EXISTS cp_brain_mutation_proposals_status_idx
ON cp_brain_mutation_proposals(status, updated_at);
`;

type WorkerRow = {
  worker_id: string;
  agent_id: string;
  session_id: string;
  status: string;
  started_at: string;
  last_heartbeat_at: string;
  stopped_at: string | null;
  metadata_json: string;
};

type ExecutionRunRow = {
  run_id: string;
  task_id: string;
  handoff_id: string;
  workflow_id: string | null;
  agent_id: string;
  worker_id: string;
  session_id: string;
  executor_id: string;
  status: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  model: string | null;
  finish_reason: string | null;
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens: number;
  reasoning_tokens: number;
  tool_call_count: number;
  tool_failure_count: number;
  estimated_cost_usd: number | null;
  error: string | null;
  metadata_json: string;
};

type ObservabilityRow = {
  event_id: string;
  kind: string;
  at: string;
  worker_id: string | null;
  agent_id: string | null;
  task_id: string | null;
  run_id: string | null;
  workflow_id: string | null;
  proposal_id: string | null;
  payload_json: string;
};

type BrainProposalRow = {
  proposal_id: string;
  handoff_id: string;
  request_id: string;
  proposal_digest: string;
  status: string;
  proposal_json: string;
  created_at: string;
  updated_at: string;
  graph_revision: number | null;
  last_error: string | null;
};

function parseJson<T>(
  value: string,
): T {
  return JSON.parse(value) as T;
}

function rowToWorker(
  row: WorkerRow,
): RuntimeWorkerRecord {
  return RuntimeWorkerRecordSchema.parse({
    workerId: row.worker_id,
    agentId: row.agent_id,
    sessionId: row.session_id,
    status: row.status,
    startedAt: row.started_at,
    lastHeartbeatAt: row.last_heartbeat_at,
    stoppedAt: row.stopped_at ?? undefined,
    metadata: parseJson(row.metadata_json),
  });
}

function rowToExecutionRun(
  row: ExecutionRunRow,
): AgentExecutionRun {
  return AgentExecutionRunSchema.parse({
    runId: row.run_id,
    taskId: row.task_id,
    handoffId: row.handoff_id,
    workflowId: row.workflow_id ?? undefined,
    agentId: row.agent_id,
    workerId: row.worker_id,
    sessionId: row.session_id,
    executorId: row.executor_id,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at ?? undefined,
    durationMs: row.duration_ms ?? undefined,
    model: row.model ?? undefined,
    finishReason: row.finish_reason ?? undefined,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    cachedInputTokens: row.cached_input_tokens,
    reasoningTokens: row.reasoning_tokens,
    toolCallCount: row.tool_call_count,
    toolFailureCount: row.tool_failure_count,
    estimatedCostUsd: row.estimated_cost_usd ?? undefined,
    error: row.error ?? undefined,
    metadata: parseJson(row.metadata_json),
  });
}

function rowToObservability(
  row: ObservabilityRow,
): RuntimeObservabilityEvent {
  return RuntimeObservabilityEventSchema.parse({
    eventId: row.event_id,
    kind: row.kind,
    at: row.at,
    workerId: row.worker_id ?? undefined,
    agentId: row.agent_id ?? undefined,
    taskId: row.task_id ?? undefined,
    runId: row.run_id ?? undefined,
    workflowId: row.workflow_id ?? undefined,
    proposalId: row.proposal_id ?? undefined,
    payload: parseJson(row.payload_json),
  });
}

function rowToBrainProposal(
  row: BrainProposalRow,
): DurableBrainMutationProposal {
  return DurableBrainMutationProposalSchema.parse({
    proposalId: row.proposal_id,
    handoffId: row.handoff_id,
    requestId: row.request_id,
    proposalDigest: row.proposal_digest,
    status: row.status,
    proposal: parseJson(row.proposal_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    graphRevision: row.graph_revision ?? undefined,
    lastError: row.last_error ?? undefined,
  });
}

function durationMs(
  startedAt: string,
  completedAt: string,
): number {
  return Math.max(
    0,
    Date.parse(completedAt) - Date.parse(startedAt),
  );
}

function brainProposalDigest(
  proposal: BrainMutationProposal,
): string {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(proposal), 'utf8')
    .digest('hex')}`;
}

export class SqliteHardenedRuntimeStore
  extends SqliteInternalRuntimeStore
  implements HardenedRuntimeStore
{
  constructor(dbPath: string) {
    super(dbPath);
    this.db.exec(HARDENED_RUNTIME_DDL);
  }

  registerRuntimeWorker(input: {
    workerId: string;
    agentId: string;
    sessionId: string;
    startedAt: string;
    metadata?: Record<string, unknown>;
  }): RuntimeWorkerRecord {
    const transaction = this.db.transaction(() => {
      const existing = this.db
        .prepare(
          `SELECT * FROM cp_runtime_workers WHERE worker_id = ?`,
        )
        .get(input.workerId) as WorkerRow | undefined;

      if (existing) {
        if (
          existing.agent_id !== input.agentId ||
          existing.session_id !== input.sessionId
        ) {
          throw new Error(
            `runtime_worker_identity_conflict:${input.workerId}`,
          );
        }

        if (existing.status === 'stopped') {
          throw new Error(
            `runtime_worker_already_stopped:${input.workerId}`,
          );
        }

        this.db
          .prepare(
            `UPDATE cp_runtime_workers
             SET last_heartbeat_at = ?
             WHERE worker_id = ?`,
          )
          .run(input.startedAt, input.workerId);

        return this.readWorker(input.workerId);
      }

      const record = RuntimeWorkerRecordSchema.parse({
        workerId: input.workerId,
        agentId: input.agentId,
        sessionId: input.sessionId,
        status: 'active',
        startedAt: input.startedAt,
        lastHeartbeatAt: input.startedAt,
        metadata: input.metadata ?? {},
      });

      this.db
        .prepare(
          `INSERT INTO cp_runtime_workers
           (worker_id,agent_id,session_id,status,started_at,last_heartbeat_at,stopped_at,metadata_json)
           VALUES (?,?,?,?,?,?,NULL,?)`,
        )
        .run(
          record.workerId,
          record.agentId,
          record.sessionId,
          record.status,
          record.startedAt,
          record.lastHeartbeatAt,
          JSON.stringify(record.metadata),
        );

      this.insertObservabilitySync({
        eventId:
          `runtime-observation:worker:${record.workerId}:registered:${record.startedAt}`,
        kind: 'worker_registered',
        at: record.startedAt,
        workerId: record.workerId,
        agentId: record.agentId,
        payload: {
          sessionId: record.sessionId,
        },
      });

      return record;
    });

    return transaction();
  }

  heartbeatRuntimeWorker(input: {
    workerId: string;
    agentId: string;
    sessionId: string;
    at: string;
  }): RuntimeWorkerRecord {
    const transaction = this.db.transaction(() => {
      const existing = this.readWorker(input.workerId);

      if (
        existing.agentId !== input.agentId ||
        existing.sessionId !== input.sessionId
      ) {
        throw new Error(
          `runtime_worker_identity_conflict:${input.workerId}`,
        );
      }

      if (existing.status !== 'active') {
        throw new Error(
          `runtime_worker_not_active:${input.workerId}`,
        );
      }

      this.db
        .prepare(
          `UPDATE cp_runtime_workers
           SET last_heartbeat_at = ?
           WHERE worker_id = ?`,
        )
        .run(input.at, input.workerId);

      this.insertObservabilitySync({
        eventId:
          `runtime-observation:worker:${input.workerId}:heartbeat:${input.at}`,
        kind: 'worker_heartbeat',
        at: input.at,
        workerId: input.workerId,
        agentId: input.agentId,
        payload: {
          sessionId: input.sessionId,
        },
      });

      return this.readWorker(input.workerId);
    });

    return transaction();
  }

  stopRuntimeWorker(input: {
    workerId: string;
    agentId: string;
    sessionId: string;
    stoppedAt: string;
    reason?: string;
  }): RuntimeWorkerRecord {
    const transaction = this.db.transaction(() => {
      const existing = this.readWorker(input.workerId);

      if (
        existing.agentId !== input.agentId ||
        existing.sessionId !== input.sessionId
      ) {
        throw new Error(
          `runtime_worker_identity_conflict:${input.workerId}`,
        );
      }

      if (existing.status === 'stopped') {
        return existing;
      }

      this.db
        .prepare(
          `UPDATE cp_runtime_workers
           SET status = 'stopped',
               stopped_at = ?,
               last_heartbeat_at = ?
           WHERE worker_id = ?`,
        )
        .run(
          input.stoppedAt,
          input.stoppedAt,
          input.workerId,
        );

      this.insertObservabilitySync({
        eventId:
          `runtime-observation:worker:${input.workerId}:stopped:${input.stoppedAt}`,
        kind: 'worker_stopped',
        at: input.stoppedAt,
        workerId: input.workerId,
        agentId: input.agentId,
        payload: {
          sessionId: input.sessionId,
          reason: input.reason ?? '',
        },
      });

      return this.readWorker(input.workerId);
    });

    return transaction();
  }

  listRuntimeWorkers(input: {
    agentId?: string;
    status?: RuntimeWorkerRecord['status'];
  } = {}): RuntimeWorkerRecord[] {
    const conditions: string[] = [];
    const params: string[] = [];

    if (input.agentId) {
      conditions.push('agent_id = ?');
      params.push(input.agentId);
    }

    if (input.status) {
      conditions.push('status = ?');
      params.push(input.status);
    }

    const where = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    return (
      this.db
        .prepare(
          `SELECT * FROM cp_runtime_workers
           ${where}
           ORDER BY started_at DESC, rowid DESC`,
        )
        .all(...params) as WorkerRow[]
    ).map(rowToWorker);
  }

  listStaleRuntimeWorkers(input: {
    now: string;
    staleAfterMs: number;
  }): RuntimeWorkerRecord[] {
    if (input.staleAfterMs <= 0) {
      throw new Error(
        'runtime_worker_stale_threshold_must_be_positive',
      );
    }

    const cutoff = new Date(
      Date.parse(input.now) - input.staleAfterMs,
    ).toISOString();

    return (
      this.db
        .prepare(
          `SELECT * FROM cp_runtime_workers
           WHERE status = 'active'
             AND last_heartbeat_at <= ?
           ORDER BY last_heartbeat_at ASC, rowid ASC`,
        )
        .all(cutoff) as WorkerRow[]
    ).map(rowToWorker);
  }

  startExecutionRun(input: {
    runId: string;
    taskId: string;
    handoffId: string;
    workflowId?: string;
    agentId: string;
    workerId: string;
    sessionId: string;
    executorId: string;
    startedAt: string;
    metadata?: Record<string, unknown>;
  }): AgentExecutionRun {
    const transaction = this.db.transaction(() => {
      const existing = this.readExecutionRunOptional(
        input.runId,
      );

      if (existing) {
        if (
          existing.taskId !== input.taskId ||
          existing.workerId !== input.workerId ||
          existing.sessionId !== input.sessionId ||
          existing.executorId !== input.executorId
        ) {
          throw new Error(
            `execution_run_identity_conflict:${input.runId}`,
          );
        }

        return existing;
      }

      const run = AgentExecutionRunSchema.parse({
        ...input,
        status: 'running',
        inputTokens: 0,
        outputTokens: 0,
        cachedInputTokens: 0,
        reasoningTokens: 0,
        toolCallCount: 0,
        toolFailureCount: 0,
        metadata: input.metadata ?? {},
      });

      this.db
        .prepare(
          `INSERT INTO cp_agent_execution_runs
           (
             run_id,task_id,handoff_id,workflow_id,agent_id,worker_id,session_id,executor_id,
             status,started_at,completed_at,duration_ms,model,finish_reason,
             input_tokens,output_tokens,cached_input_tokens,reasoning_tokens,
             tool_call_count,tool_failure_count,estimated_cost_usd,error,metadata_json
           )
           VALUES (?,?,?,?,?,?,?,?,?,?,NULL,NULL,NULL,NULL,0,0,0,0,0,0,NULL,NULL,?)`,
        )
        .run(
          run.runId,
          run.taskId,
          run.handoffId,
          run.workflowId ?? null,
          run.agentId,
          run.workerId,
          run.sessionId,
          run.executorId,
          run.status,
          run.startedAt,
          JSON.stringify(run.metadata),
        );

      this.insertObservabilitySync({
        eventId:
          `runtime-observation:run:${run.runId}:started`,
        kind: 'execution_started',
        at: run.startedAt,
        workerId: run.workerId,
        agentId: run.agentId,
        taskId: run.taskId,
        runId: run.runId,
        workflowId: run.workflowId,
        payload: {
          executorId: run.executorId,
          sessionId: run.sessionId,
        },
      });

      return run;
    });

    return transaction();
  }

  finishExecutionRun(input: {
    runId: string;
    status: 'succeeded' | 'failed';
    completedAt: string;
    model?: string;
    finishReason?: string;
    inputTokens?: number;
    outputTokens?: number;
    cachedInputTokens?: number;
    reasoningTokens?: number;
    toolCallCount?: number;
    toolFailureCount?: number;
    estimatedCostUsd?: number;
    error?: string;
    metadata?: Record<string, unknown>;
  }): AgentExecutionRun {
    const transaction = this.db.transaction(() => {
      const current = this.readExecutionRun(input.runId);

      if (current.status !== 'running') {
        if (current.status === input.status) {
          return current;
        }

        throw new Error(
          `execution_run_already_terminal:${input.runId}:${current.status}`,
        );
      }

      const parsed = AgentExecutionRunSchema.parse({
        ...current,
        status: input.status,
        completedAt: input.completedAt,
        durationMs: durationMs(
          current.startedAt,
          input.completedAt,
        ),
        model: input.model,
        finishReason: input.finishReason,
        inputTokens: input.inputTokens ?? 0,
        outputTokens: input.outputTokens ?? 0,
        cachedInputTokens: input.cachedInputTokens ?? 0,
        reasoningTokens: input.reasoningTokens ?? 0,
        toolCallCount: input.toolCallCount ?? 0,
        toolFailureCount: input.toolFailureCount ?? 0,
        estimatedCostUsd: input.estimatedCostUsd,
        error: input.error,
        metadata: {
          ...current.metadata,
          ...(input.metadata ?? {}),
        },
      });

      this.db
        .prepare(
          `UPDATE cp_agent_execution_runs
           SET status=?,completed_at=?,duration_ms=?,model=?,finish_reason=?,
               input_tokens=?,output_tokens=?,cached_input_tokens=?,reasoning_tokens=?,
               tool_call_count=?,tool_failure_count=?,estimated_cost_usd=?,error=?,metadata_json=?
           WHERE run_id=? AND status='running'`,
        )
        .run(
          parsed.status,
          parsed.completedAt,
          parsed.durationMs,
          parsed.model ?? null,
          parsed.finishReason ?? null,
          parsed.inputTokens,
          parsed.outputTokens,
          parsed.cachedInputTokens,
          parsed.reasoningTokens,
          parsed.toolCallCount,
          parsed.toolFailureCount,
          parsed.estimatedCostUsd ?? null,
          parsed.error ?? null,
          JSON.stringify(parsed.metadata),
          parsed.runId,
        );

      this.insertObservabilitySync({
        eventId:
          `runtime-observation:run:${parsed.runId}:${parsed.status}`,
        kind:
          parsed.status === 'succeeded'
            ? 'execution_succeeded'
            : 'execution_failed',
        at: parsed.completedAt!,
        workerId: parsed.workerId,
        agentId: parsed.agentId,
        taskId: parsed.taskId,
        runId: parsed.runId,
        workflowId: parsed.workflowId,
        payload: {
          durationMs: parsed.durationMs,
          model: parsed.model,
          inputTokens: parsed.inputTokens,
          outputTokens: parsed.outputTokens,
          cachedInputTokens: parsed.cachedInputTokens,
          reasoningTokens: parsed.reasoningTokens,
          toolCallCount: parsed.toolCallCount,
          toolFailureCount: parsed.toolFailureCount,
          estimatedCostUsd: parsed.estimatedCostUsd,
          finishReason: parsed.finishReason,
          error: parsed.error,
        },
      });

      return parsed;
    });

    return transaction();
  }

  listExecutionRuns(input: {
    agentId?: string;
    workerId?: string;
    taskId?: string;
    status?: AgentExecutionRun['status'];
  } = {}): AgentExecutionRun[] {
    const conditions: string[] = [];
    const params: string[] = [];

    if (input.agentId) {
      conditions.push('agent_id = ?');
      params.push(input.agentId);
    }

    if (input.workerId) {
      conditions.push('worker_id = ?');
      params.push(input.workerId);
    }

    if (input.taskId) {
      conditions.push('task_id = ?');
      params.push(input.taskId);
    }

    if (input.status) {
      conditions.push('status = ?');
      params.push(input.status);
    }

    const where = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    return (
      this.db
        .prepare(
          `SELECT * FROM cp_agent_execution_runs
           ${where}
           ORDER BY started_at DESC, rowid DESC`,
        )
        .all(...params) as ExecutionRunRow[]
    ).map(rowToExecutionRun);
  }

  appendRuntimeObservabilityEvent(
    event: RuntimeObservabilityEvent,
  ): void {
    this.insertObservabilitySync(
      RuntimeObservabilityEventSchema.parse(event),
    );
  }

  listRuntimeObservabilityEvents(input: {
    kind?: RuntimeObservabilityEvent['kind'];
    workerId?: string;
    agentId?: string;
    runId?: string;
    proposalId?: string;
  } = {}): RuntimeObservabilityEvent[] {
    const conditions: string[] = [];
    const params: string[] = [];

    if (input.kind) {
      conditions.push('kind = ?');
      params.push(input.kind);
    }

    if (input.workerId) {
      conditions.push('worker_id = ?');
      params.push(input.workerId);
    }

    if (input.agentId) {
      conditions.push('agent_id = ?');
      params.push(input.agentId);
    }

    if (input.runId) {
      conditions.push('run_id = ?');
      params.push(input.runId);
    }

    if (input.proposalId) {
      conditions.push('proposal_id = ?');
      params.push(input.proposalId);
    }

    const where = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    return (
      this.db
        .prepare(
          `SELECT * FROM cp_runtime_observability
           ${where}
           ORDER BY at ASC, rowid ASC`,
        )
        .all(...params) as ObservabilityRow[]
    ).map(rowToObservability);
  }

  persistBrainMutationProposal(input: {
    handoffId: string;
    proposal: BrainMutationProposal;
    persistedAt: string;
  }): DurableBrainMutationProposal {
    const proposal = BrainMutationProposalSchema.parse(
      input.proposal,
    );

    const digest = brainProposalDigest(proposal);

    const transaction = this.db.transaction(() => {
      const byProposal = this.db
        .prepare(
          `SELECT * FROM cp_brain_mutation_proposals
           WHERE proposal_id = ?`,
        )
        .get(proposal.proposalId) as
        | BrainProposalRow
        | undefined;

      if (byProposal) {
        const existing = rowToBrainProposal(byProposal);

        if (
          existing.handoffId !== input.handoffId ||
          existing.proposalDigest !== digest
        ) {
          throw new Error(
            `brain_proposal_integrity_conflict:${proposal.proposalId}`,
          );
        }

        return existing;
      }

      const byHandoff = this.db
        .prepare(
          `SELECT * FROM cp_brain_mutation_proposals
           WHERE handoff_id = ?`,
        )
        .get(input.handoffId) as
        | BrainProposalRow
        | undefined;

      if (byHandoff) {
        throw new Error(
          `brain_handoff_proposal_conflict:${input.handoffId}`,
        );
      }

      const record = DurableBrainMutationProposalSchema.parse({
        proposalId: proposal.proposalId,
        handoffId: input.handoffId,
        requestId: proposal.requestId,
        proposalDigest: digest,
        status: 'composed',
        proposal,
        createdAt: input.persistedAt,
        updatedAt: input.persistedAt,
      });

      this.db
        .prepare(
          `INSERT INTO cp_brain_mutation_proposals
           (proposal_id,handoff_id,request_id,proposal_digest,status,proposal_json,created_at,updated_at,graph_revision,last_error)
           VALUES (?,?,?,?,?,?,?, ?,NULL,NULL)`,
        )
        .run(
          record.proposalId,
          record.handoffId,
          record.requestId,
          record.proposalDigest,
          record.status,
          JSON.stringify(record.proposal),
          record.createdAt,
          record.updatedAt,
        );

      this.insertObservabilitySync({
        eventId:
          `runtime-observation:brain-proposal:${record.proposalId}:persisted`,
        kind: 'brain_proposal_persisted',
        at: record.createdAt,
        workflowId:
          record.proposal.context.workflowIds[0],
        proposalId: record.proposalId,
        payload: {
          handoffId: record.handoffId,
          requestId: record.requestId,
          proposalDigest: record.proposalDigest,
        },
      });

      return record;
    });

    return transaction();
  }

  updateBrainMutationProposal(input: {
    proposalId: string;
    status: DurableBrainProposalStatus;
    updatedAt: string;
    graphRevision?: number;
    lastError?: string;
  }): DurableBrainMutationProposal {
    const transaction = this.db.transaction(() => {
      const current = this.getBrainMutationProposal(
        input.proposalId,
      );

      if (!current) {
        throw new Error(
          `brain_proposal_not_found:${input.proposalId}`,
        );
      }

      this.db
        .prepare(
          `UPDATE cp_brain_mutation_proposals
           SET status=?,updated_at=?,graph_revision=?,last_error=?
           WHERE proposal_id=?`,
        )
        .run(
          input.status,
          input.updatedAt,
          input.graphRevision ??
            current.graphRevision ??
            null,
          input.lastError ?? null,
          input.proposalId,
        );

      const updated = this.getBrainMutationProposal(
        input.proposalId,
      )!;

      if (input.status === 'pending_control_plane') {
        this.insertObservabilitySync({
          eventId:
            `runtime-observation:brain-proposal:${input.proposalId}:pending-control-plane`,
          kind: 'brain_proposal_pending_control_plane',
          at: input.updatedAt,
          workflowId:
            updated.proposal.context.workflowIds[0],
          proposalId: input.proposalId,
          payload: {
            graphRevision: input.graphRevision,
          },
        });
      } else if (input.status === 'failed') {
        this.insertObservabilitySync({
          eventId:
            `runtime-observation:brain-proposal:${input.proposalId}:failed:${input.updatedAt}`,
          kind: 'brain_proposal_failed',
          at: input.updatedAt,
          workflowId:
            updated.proposal.context.workflowIds[0],
          proposalId: input.proposalId,
          payload: {
            error: input.lastError ?? '',
          },
        });
      }

      return updated;
    });

    return transaction();
  }

  getBrainMutationProposal(
    proposalId: string,
  ): DurableBrainMutationProposal | null {
    const row = this.db
      .prepare(
        `SELECT * FROM cp_brain_mutation_proposals
         WHERE proposal_id = ?`,
      )
      .get(proposalId) as
      | BrainProposalRow
      | undefined;

    return row ? rowToBrainProposal(row) : null;
  }

  listBrainMutationProposals(input: {
    status?: DurableBrainProposalStatus;
    handoffId?: string;
  } = {}): DurableBrainMutationProposal[] {
    const conditions: string[] = [];
    const params: string[] = [];

    if (input.status) {
      conditions.push('status = ?');
      params.push(input.status);
    }

    if (input.handoffId) {
      conditions.push('handoff_id = ?');
      params.push(input.handoffId);
    }

    const where = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    return (
      this.db
        .prepare(
          `SELECT * FROM cp_brain_mutation_proposals
           ${where}
           ORDER BY created_at DESC, rowid DESC`,
        )
        .all(...params) as BrainProposalRow[]
    ).map(rowToBrainProposal);
  }

  private readWorker(
    workerId: string,
  ): RuntimeWorkerRecord {
    const row = this.db
      .prepare(
        `SELECT * FROM cp_runtime_workers
         WHERE worker_id = ?`,
      )
      .get(workerId) as
      | WorkerRow
      | undefined;

    if (!row) {
      throw new Error(
        `runtime_worker_not_found:${workerId}`,
      );
    }

    return rowToWorker(row);
  }

  private readExecutionRun(
    runId: string,
  ): AgentExecutionRun {
    const run = this.readExecutionRunOptional(runId);

    if (!run) {
      throw new Error(
        `execution_run_not_found:${runId}`,
      );
    }

    return run;
  }

  private readExecutionRunOptional(
    runId: string,
  ): AgentExecutionRun | null {
    const row = this.db
      .prepare(
        `SELECT * FROM cp_agent_execution_runs
         WHERE run_id = ?`,
      )
      .get(runId) as
      | ExecutionRunRow
      | undefined;

    return row ? rowToExecutionRun(row) : null;
  }

  private insertObservabilitySync(
    rawEvent: RuntimeObservabilityEvent,
  ): void {
    const event =
      RuntimeObservabilityEventSchema.parse(rawEvent);

    this.db
      .prepare(
        `INSERT OR IGNORE INTO cp_runtime_observability
         (event_id,kind,at,worker_id,agent_id,task_id,run_id,workflow_id,proposal_id,payload_json)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        event.eventId,
        event.kind,
        event.at,
        event.workerId ?? null,
        event.agentId ?? null,
        event.taskId ?? null,
        event.runId ?? null,
        event.workflowId ?? null,
        event.proposalId ?? null,
        JSON.stringify(event.payload),
      );
  }
}
