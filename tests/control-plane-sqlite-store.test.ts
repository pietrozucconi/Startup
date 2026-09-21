import {
  afterEach,
  describe,
  expect,
  test,
} from 'vitest';

import {
  mkdtempSync,
  rmSync,
} from 'node:fs';

import {
  tmpdir,
} from 'node:os';

import path from 'node:path';

import {
  SqliteControlPlaneStore,
} from '@/lib/control-plane/sqlite-store';

import type {
  InvestmentWorkflow,
} from '@/lib/control-plane/schema';

let tempDir: string | null = null;

afterEach(() => {
  if (tempDir) {
    rmSync(
      tempDir,
      {
        recursive: true,
        force: true,
      },
    );

    tempDir = null;
  }
});

function databasePath(): string {
  tempDir = mkdtempSync(
    path.join(
      tmpdir(),
      'startup-cp-v2-',
    ),
  );

  return path.join(
    tempDir,
    'control-plane.db',
  );
}

function workflow(
  revision = 0,
): InvestmentWorkflow {
  return {
    id: 'wf-1',
    state:
      revision === 0
        ? 'DRAFT'
        : 'RESEARCHING',
    revision,
    createdBy: {
      kind: 'agent',
      id: 'lauti',
    },
    createdAt:
      '2026-01-01T00:00:00.000Z',
    updatedAt:
      revision === 0
        ? '2026-01-01T00:00:00.000Z'
        : '2026-01-01T00:01:00.000Z',
    responsibleResearchAgentId:
      'lauti',
    assetRef: 'asset:test',
    artifacts: [],
    invalidations: [],
    metadata: {},
  };
}

describe('SQLite Control Plane persistence', () => {
  test('survives process-store reopen for workflow, idempotency and audit', async () => {
    const dbPath = databasePath();

    const first =
      new SqliteControlPlaneStore(
        dbPath,
      );

    await first.createWorkflow(
      workflow(),
    );

    await first.markProcessedRequest(
      'request-1',
    );

    await first.appendAudit({
      auditId: 'audit-1',
      requestId: 'request-1',
      at:
        '2026-01-01T00:00:00.000Z',
      actor: {
        kind: 'agent',
        id: 'lauti',
      },
      action: 'workflow.create',
      outcome: 'created',
      reason: 'test',
      workflowId: 'wf-1',
      workflowRevisionAfter: 0,
      metadata: {},
    });

    first.close();

    const second =
      new SqliteControlPlaneStore(
        dbPath,
      );

    expect(
      await second.getWorkflow('wf-1'),
    ).toMatchObject({
      id: 'wf-1',
      revision: 0,
      state: 'DRAFT',
    });

    expect(
      await second.hasProcessedRequest(
        'request-1',
      ),
    ).toBe(true);

    expect(
      await second.listAudit('wf-1'),
    ).toHaveLength(1);

    second.close();
  });

  test('enforces optimistic concurrency across independent store instances', async () => {
    const dbPath = databasePath();

    const storeA =
      new SqliteControlPlaneStore(
        dbPath,
      );

    const storeB =
      new SqliteControlPlaneStore(
        dbPath,
      );

    await storeA.createWorkflow(
      workflow(),
    );

    await storeA.replaceWorkflow({
      workflow: workflow(1),
      expectedRevision: 0,
    });

    await expect(
      storeB.replaceWorkflow({
        workflow: {
          ...workflow(1),
          updatedAt:
            '2026-01-01T00:02:00.000Z',
        },
        expectedRevision: 0,
      }),
    ).rejects.toThrow(
      'workflow_revision_conflict',
    );

    storeA.close();
    storeB.close();
  });

  test('persists append-only command and domain-event ledgers', () => {
    const store =
      new SqliteControlPlaneStore(
        databasePath(),
      );

    store.appendCommand({
      commandId: 'cmd-1',
      requestId: 'request-1',
      workflowId: 'wf-1',
      commandType:
        'transition_workflow',
      actor: {
        kind: 'agent',
        id: 'lauti',
      },
      receivedAt:
        '2026-01-01T00:00:00.000Z',
      outcome: 'succeeded',
      reason: 'test',
      payload: {
        from: 'DRAFT',
        to: 'RESEARCHING',
      },
    });

    store.appendDomainEvent({
      eventId: 'evt-1',
      requestId: 'request-1',
      workflowId: 'wf-1',
      sequence: 1,
      eventType:
        'workflow_transitioned',
      actor: {
        kind: 'agent',
        id: 'lauti',
      },
      occurredAt:
        '2026-01-01T00:00:00.000Z',
      payload: {
        from: 'DRAFT',
        to: 'RESEARCHING',
      },
    });

    expect(
      store.listCommands('wf-1'),
    ).toHaveLength(1);

    expect(
      store.listDomainEvents('wf-1'),
    ).toHaveLength(1);

    expect(() =>
      store.appendDomainEvent({
        eventId: 'evt-2',
        requestId: 'request-2',
        workflowId: 'wf-1',
        sequence: 1,
        eventType:
          'workflow_transitioned',
        actor: {
          kind: 'agent',
          id: 'lauti',
        },
        occurredAt:
          '2026-01-01T00:01:00.000Z',
        payload: {},
      }),
    ).toThrow();

    store.close();
  });
});
