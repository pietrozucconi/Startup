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
  SqliteInternalRuntimeStore,
} from '@/lib/control-plane/sqlite-runtime-store';

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

function store() {
  tempDir = mkdtempSync(
    path.join(
      tmpdir(),
      'startup-ceo-inbox-',
    ),
  );

  return new SqliteInternalRuntimeStore(
    path.join(
      tempDir,
      'cp.db',
    ),
  );
}

describe('CEO approval inbox', () => {
  test('cannot be resolved without a succeeded Control Plane command', () => {
    const cp = store();

    cp.upsertCeoInboxItem({
      inboxId: 'inbox-1',
      handoffId: 'handoff-1',
      workflowId: 'wf-1',
      category:
        'approval_request',
      action:
        'decide_research_proposal',
      summary:
        'CEO decision required.',
      stateAtCreation:
        'WAITING_CEO_RESEARCH_DECISION',
      createdAt:
        '2026-01-01T00:00:00.000Z',
      updatedAt:
        '2026-01-01T00:00:00.000Z',
      policyEvidence: [],
      payload: {},
    });

    expect(() =>
      cp.resolveCeoInboxAfterControlPlane({
        inboxId: 'inbox-1',
        controlPlaneRequestId:
          'missing-command',
        resolvedAt:
          '2026-01-01T00:01:00.000Z',
      }),
    ).toThrow(
      'ceo_inbox_control_plane_request_not_found',
    );

    cp.appendCommand({
      commandId: 'command-1',
      requestId:
        'ceo-transition-1',
      workflowId: 'wf-1',
      commandType:
        'transition_workflow',
      actor: {
        kind: 'human',
        id: 'ceo',
      },
      receivedAt:
        '2026-01-01T00:01:00.000Z',
      outcome: 'succeeded',
      reason:
        'CEO approved research.',
      payload: {},
    });

    const resolved =
      cp.resolveCeoInboxAfterControlPlane({
        inboxId: 'inbox-1',
        controlPlaneRequestId:
          'ceo-transition-1',
        resolvedAt:
          '2026-01-01T00:01:01.000Z',
      });

    expect(resolved).toMatchObject({
      status: 'resolved',
      resolvedByControlPlaneRequestId:
        'ceo-transition-1',
    });

    cp.close();
  });
});
