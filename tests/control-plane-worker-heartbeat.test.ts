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
  SqliteHardenedRuntimeStore,
} from '@/lib/control-plane/sqlite-hardened-runtime-store';

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
        'startup-worker-heartbeat-',
      ),
    );

  return new SqliteHardenedRuntimeStore(
    path.join(
      tempDir,
      'cp.db',
    ),
  );
}

describe(
  'V2I.2B worker supervision',
  () => {
    test(
      'registers, heartbeats, detects staleness and stops a worker',
      () => {
        const cp = store();

        cp.registerRuntimeWorker({
          workerId:
            'worker-lauti-1',
          agentId:
            'lauti',
          sessionId:
            'session-lauti',
          startedAt:
            '2026-01-01T00:00:00.000Z',
        });

        cp.heartbeatRuntimeWorker({
          workerId:
            'worker-lauti-1',
          agentId:
            'lauti',
          sessionId:
            'session-lauti',
          at:
            '2026-01-01T00:00:10.000Z',
        });

        expect(
          cp.listStaleRuntimeWorkers({
            now:
              '2026-01-01T00:00:20.000Z',
            staleAfterMs:
              15_000,
          }),
        ).toHaveLength(0);

        expect(
          cp.listStaleRuntimeWorkers({
            now:
              '2026-01-01T00:00:30.000Z',
            staleAfterMs:
              15_000,
          }),
        ).toHaveLength(1);

        const stopped =
          cp.stopRuntimeWorker({
            workerId:
              'worker-lauti-1',
            agentId:
              'lauti',
            sessionId:
              'session-lauti',
            stoppedAt:
              '2026-01-01T00:00:31.000Z',
            reason:
              'test stop',
          });

        expect(
          stopped.status,
        ).toBe('stopped');

        expect(
          cp.listStaleRuntimeWorkers({
            now:
              '2026-01-01T00:01:00.000Z',
            staleAfterMs:
              1_000,
          }),
        ).toHaveLength(0);

        expect(
          cp.listRuntimeObservabilityEvents({
            workerId:
              'worker-lauti-1',
          }).map(
            (event) =>
              event.kind,
          ),
        ).toEqual([
          'worker_registered',
          'worker_heartbeat',
          'worker_stopped',
        ]);

        cp.close();
      },
    );
  },
);
