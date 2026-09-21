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
  AtomicCompanyControlPlane,
} from '@/lib/control-plane/atomic-engine';

import {
  SqliteAtomicControlPlaneStore,
} from '@/lib/control-plane/sqlite-atomic-store';

let tempDir: string | null = null;

const now =
  '2026-01-01T00:00:00.000Z';

const retryPolicy = {
  maxAttempts: 2,
  initialDelayMs: 1_000,
  backoffMultiplier: 2,
  maxDelayMs: 10_000,
  timeoutMs: 30_000,
};

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
      'startup-cp-v2b-',
    ),
  );

  return path.join(
    tempDir,
    'control-plane.db',
  );
}

function principal(
  kind: 'agent' | 'human' | 'control_plane' | 'system',
  id: string,
) {
  return {
    actor: {
      kind,
      id,
    },
  };
}

function setup() {
  const store =
    new SqliteAtomicControlPlaneStore(
      databasePath(),
    );

  const engine =
    new AtomicCompanyControlPlane(
      store,
      () => now,
    );

  return {
    store,
    engine,
  };
}

describe('Control Plane V2B atomic unit of work', () => {
  test('commits workflow, command, idempotency, audit, event and outbox together', async () => {
    const { store, engine } = setup();

    const result =
      await engine.createWorkflow({
        requestId: 'create-1',
        workflowId: 'wf-1',
        principal: principal(
          'agent',
          'lauti',
        ),
        responsibleResearchAgentId:
          'lauti',
        assetRef: 'asset:test',
        reason: 'Start research.',
        metadata: {},
      });

    expect(result.duplicate).toBe(false);
    expect(result.workflow.state).toBe(
      'DRAFT',
    );

    expect(
      await store.hasProcessedRequest(
        'create-1',
      ),
    ).toBe(true);

    expect(
      store.listCommands('wf-1'),
    ).toHaveLength(1);

    expect(
      await store.listAudit('wf-1'),
    ).toHaveLength(1);

    expect(
      store.listDomainEvents('wf-1'),
    ).toMatchObject([
      {
        eventType:
          'workflow_created',
        sequence: 0,
      },
    ]);

    expect(
      store.listOutbox(),
    ).toMatchObject([
      {
        status: 'pending',
        topic:
          'control-plane.workflow.created',
      },
    ]);

    store.close();
  });

  test('same request id is idempotent and creates no duplicate durable records', async () => {
    const { store, engine } = setup();

    const request = {
      requestId: 'same-request',
      workflowId: 'wf-1',
      principal: principal(
        'agent',
        'lauti',
      ),
      responsibleResearchAgentId:
        'lauti',
      assetRef: 'asset:test',
      reason: 'Start research.',
      metadata: {},
    };

    const first =
      await engine.createWorkflow(request);

    const second =
      await engine.createWorkflow(request);

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);

    expect(
      store.listCommands('wf-1'),
    ).toHaveLength(1);

    expect(
      store.listDomainEvents('wf-1'),
    ).toHaveLength(1);

    expect(
      store.listOutbox(),
    ).toHaveLength(1);

    store.close();
  });

  test('rolls back all command state when a late outbox insert fails', async () => {
    const { store, engine } = setup();

    store.enqueueOutbox({
      messageId:
        'cp-outbox:create-rollback',
      topic: 'preexisting.test',
      partitionKey: 'preexisting',
      createdAt: now,
      availableAt: now,
      retryPolicy,
      payload: {},
    });

    await expect(
      engine.createWorkflow({
        requestId: 'create-rollback',
        workflowId: 'wf-rollback',
        principal: principal(
          'agent',
          'lauti',
        ),
        responsibleResearchAgentId:
          'lauti',
        reason: 'Rollback proof.',
        metadata: {},
      }),
    ).rejects.toThrow();

    expect(
      await store.getWorkflow(
        'wf-rollback',
      ),
    ).toBeNull();

    expect(
      await store.hasProcessedRequest(
        'create-rollback',
      ),
    ).toBe(false);

    expect(
      store.listCommands(
        'wf-rollback',
      ),
    ).toHaveLength(0);

    expect(
      store.listDomainEvents(
        'wf-rollback',
      ),
    ).toHaveLength(0);

    expect(
      await store.listAudit(
        'wf-rollback',
      ),
    ).toHaveLength(0);

    expect(store.listOutbox()).toHaveLength(1);

    store.close();
  });

  test('transition and artifact mutations receive monotonic event sequences', async () => {
    const { store, engine } = setup();

    await engine.createWorkflow({
      requestId: 'create',
      workflowId: 'wf-1',
      principal: principal(
        'agent',
        'lauti',
      ),
      responsibleResearchAgentId:
        'lauti',
      reason: 'Start.',
      metadata: {},
    });

    await engine.transition({
      requestId: 'to-research',
      workflowId: 'wf-1',
      principal: principal(
        'agent',
        'lauti',
      ),
      fromState: 'DRAFT',
      toState: 'RESEARCHING',
      expectedRevision: 0,
      reason: 'Begin research.',
    });

    await engine.registerArtifact({
      requestId: 'proposal',
      workflowId: 'wf-1',
      principal: principal(
        'agent',
        'lauti',
      ),
      expectedRevision: 1,
      artifact: {
        id: 'proposal-1',
        workflowId: 'wf-1',
        kind: 'research_proposal',
        createdBy: {
          kind: 'agent',
          id: 'lauti',
        },
        createdAt: now,
        summary: 'Proposal.',
        metadata: {},
      },
      reason: 'Record proposal.',
    });

    const events =
      store.listDomainEvents('wf-1');

    expect(
      events.map(
        (event) => event.sequence,
      ),
    ).toEqual([0, 1, 2]);

    store.close();
  });

  test('financial authorization is durably recorded and remains CEO-only', async () => {
    const { store, engine } = setup();

    const agentDecision =
      await engine.authorizeFinancialAction({
        requestId: 'agent-buy',
        principal: principal(
          'agent',
          'angelo',
        ),
        action: 'buy',
        reason: 'Attempt execution.',
      });

    expect(agentDecision.allowed).toBe(false);

    const ceoDecision =
      await engine.authorizeFinancialAction({
        requestId: 'ceo-buy',
        principal: principal(
          'human',
          'ceo',
        ),
        action: 'buy',
        reason: 'Human execution.',
      });

    expect(ceoDecision.allowed).toBe(true);

    const commands =
      store.listCommands();

    expect(commands).toHaveLength(2);
    expect(commands[0]?.outcome).toBe(
      'denied',
    );
    expect(commands[1]?.outcome).toBe(
      'succeeded',
    );

    const events =
      store.listDomainEvents();

    expect(
      events.map(
        (event) => event.eventType,
      ),
    ).toEqual([
      'financial_action_denied',
      'financial_action_authorized',
    ]);

    store.close();
  });
});
