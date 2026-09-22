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
  fingerprintControlPlaneRequest,
} from '@/lib/control-plane/request-fingerprint';

import {
  SqliteAtomicControlPlaneStore,
} from '@/lib/control-plane/sqlite-atomic-store';

let tempDir:
  | string
  | null = null;

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
  tempDir =
    mkdtempSync(
      path.join(
        tmpdir(),
        'startup-request-integrity-',
      ),
    );

  return new SqliteAtomicControlPlaneStore(
    path.join(
      tempDir,
      'cp.db',
    ),
  );
}

describe(
  'Control Plane request integrity',
  () => {
    test(
      'fingerprint ignores transport metadata but preserves semantic payload',
      () => {
        const first =
          fingerprintControlPlaneRequest({
            requestId: 'request-a',
            workflowId: 'wf-1',
            principal: {
              actor: {
                kind: 'agent',
                id: 'lauti',
              },
              sessionId:
                'session-a',
            },
            expectedRevision: 1,
            reason:
              'same semantic request',
            artifact: {
              id: 'artifact-1',
              summary:
                'Research summary',
              createdAt:
                '2026-01-01T00:00:00.000Z',
              metadata: {
                confidence: 0.8,
              },
            },
          });

        const retry =
          fingerprintControlPlaneRequest({
            requestId: 'request-a',
            workflowId: 'wf-1',
            principal: {
              actor: {
                kind: 'agent',
                id: 'lauti',
              },
              sessionId:
                'session-b',
            },
            expectedRevision: 99,
            reason:
              'same semantic request',
            artifact: {
              id: 'artifact-1',
              summary:
                'Research summary',
              createdAt:
                '2026-01-02T00:00:00.000Z',
              metadata: {
                confidence: 0.8,
              },
            },
          });

        const changed =
          fingerprintControlPlaneRequest({
            requestId: 'request-a',
            workflowId: 'wf-1',
            principal: {
              actor: {
                kind: 'agent',
                id: 'lauti',
              },
            },
            reason:
              'same semantic request',
            artifact: {
              id: 'artifact-1',
              summary:
                'Different research summary',
              metadata: {
                confidence: 0.8,
              },
            },
          });

        expect(retry).toBe(
          first,
        );

        expect(changed).not.toBe(
          first,
        );
      },
    );

    test(
      'same requestId and same semantic create request is duplicate, changed payload is an integrity conflict',
      async () => {
        const cpStore =
          store();

        const controlPlane =
          new AtomicCompanyControlPlane(
            cpStore,
            () =>
              '2026-01-01T00:00:00.000Z',
          );

        const base = {
          requestId:
            'create-request-1',
          workflowId: 'wf-1',
          principal: {
            actor: {
              kind:
                'agent' as const,
              id: 'lauti',
            },
          },
          responsibleResearchAgentId:
            'lauti',
          assetRef: 'ABC',
          reason:
            'Start governed research.',
          metadata: {
            source: 'test',
          },
        };

        const first =
          await controlPlane
            .createWorkflow(
              base,
            );

        expect(
          first.duplicate,
        ).toBe(false);

        const duplicate =
          await controlPlane
            .createWorkflow({
              ...base,
            });

        expect(
          duplicate.duplicate,
        ).toBe(true);

        await expect(
          controlPlane
            .createWorkflow({
              ...base,
              assetRef: 'XYZ',
            }),
        ).rejects.toThrow(
          'request_id_reuse_conflict:create-request-1',
        );

        expect(
          await cpStore
            .getRequestFingerprint(
              'create-request-1',
            ),
        ).toMatchObject({
          status:
            'committed',
        });

        cpStore.close();
      },
    );

    test(
      'a denied request still reserves its semantic identity',
      async () => {
        const cpStore =
          store();

        const controlPlane =
          new AtomicCompanyControlPlane(
            cpStore,
            () =>
              '2026-01-01T00:00:00.000Z',
          );

        await controlPlane
          .createWorkflow({
            requestId:
              'create-denied-test',
            workflowId:
              'wf-denied',
            principal: {
              actor: {
                kind:
                  'agent',
                id: 'lauti',
              },
            },
            responsibleResearchAgentId:
              'lauti',
            reason:
              'Create workflow.',
          });

        await expect(
          controlPlane.transition({
            requestId:
              'transition-reused',
            workflowId:
              'wf-denied',
            principal: {
              actor: {
                kind:
                  'agent',
                id: 'lauti',
              },
            },
            fromState:
              'DRAFT',
            toState:
              'RISK_ANALYSIS',
            reason:
              'Invalid jump.',
          }),
        ).rejects.toThrow();

        expect(
          await cpStore
            .getRequestFingerprint(
              'transition-reused',
            ),
        ).toMatchObject({
          status:
            'reserved',
        });

        await expect(
          controlPlane.transition({
            requestId:
              'transition-reused',
            workflowId:
              'wf-denied',
            principal: {
              actor: {
                kind:
                  'agent',
                id: 'lauti',
              },
            },
            fromState:
              'DRAFT',
            toState:
              'RESEARCHING',
            reason:
              'Changed meaning.',
          }),
        ).rejects.toThrow(
          'request_id_reuse_conflict:transition-reused',
        );

        cpStore.close();
      },
    );

    test(
      'runtime-generated artifact timestamp can change on retry but changed summary cannot reuse the requestId',
      async () => {
        const cpStore =
          store();

        let second = 0;

        const controlPlane =
          new AtomicCompanyControlPlane(
            cpStore,
            () =>
              `2026-01-01T00:00:0${second++}.000Z`,
          );

        await controlPlane
          .createWorkflow({
            requestId:
              'artifact-create',
            workflowId:
              'wf-artifact',
            principal: {
              actor: {
                kind:
                  'agent',
                id: 'lauti',
              },
            },
            responsibleResearchAgentId:
              'lauti',
            reason:
              'Create workflow.',
          });

        await controlPlane
          .transition({
            requestId:
              'artifact-start',
            workflowId:
              'wf-artifact',
            principal: {
              actor: {
                kind:
                  'agent',
                id: 'lauti',
              },
            },
            fromState:
              'DRAFT',
            toState:
              'RESEARCHING',
            reason:
              'Start research.',
          });

        const baseArtifact = {
          id:
            'artifact:research-1',
          workflowId:
            'wf-artifact',
          kind:
            'research_proposal' as const,
          createdBy: {
            kind:
              'agent' as const,
            id: 'lauti',
          },
          summary:
            'Research proposal.',
          status:
            'active' as const,
          metadata: {
            confidence: 0.8,
          },
        };

        const before =
          await controlPlane
            .getWorkflow(
              'wf-artifact',
            );

        const first =
          await controlPlane
            .registerArtifact({
              requestId:
                'artifact-request-1',
              workflowId:
                'wf-artifact',
              principal: {
                actor: {
                  kind:
                    'agent',
                  id: 'lauti',
                },
              },
              expectedRevision:
                before.revision,
              artifact: {
                ...baseArtifact,
                createdAt:
                  '2026-01-01T00:00:10.000Z',
              },
              reason:
                'Submit proposal.',
            });

        const duplicate =
          await controlPlane
            .registerArtifact({
              requestId:
                'artifact-request-1',
              workflowId:
                'wf-artifact',
              principal: {
                actor: {
                  kind:
                    'agent',
                  id: 'lauti',
                },
              },
              expectedRevision:
                999,
              artifact: {
                ...baseArtifact,
                createdAt:
                  '2026-01-01T00:00:20.000Z',
              },
              reason:
                'Submit proposal.',
            });

        expect(
          first.duplicate,
        ).toBe(false);

        expect(
          duplicate.duplicate,
        ).toBe(true);

        await expect(
          controlPlane
            .registerArtifact({
              requestId:
                'artifact-request-1',
              workflowId:
                'wf-artifact',
              principal: {
                actor: {
                  kind:
                    'agent',
                  id: 'lauti',
                },
              },
              artifact: {
                ...baseArtifact,
                createdAt:
                  '2026-01-01T00:00:30.000Z',
                summary:
                  'Changed proposal.',
              },
              reason:
                'Submit proposal.',
            }),
        ).rejects.toThrow(
          'request_id_reuse_conflict:artifact-request-1',
        );

        cpStore.close();
      },
    );
  },
);
