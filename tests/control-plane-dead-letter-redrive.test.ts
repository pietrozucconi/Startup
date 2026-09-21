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
  OutboxConsumerRegistry,
} from '@/lib/control-plane/consumer';

import {
  ReliableOutboxWorker,
} from '@/lib/control-plane/outbox-worker';

import {
  SqliteReliableControlPlaneStore,
} from '@/lib/control-plane/sqlite-reliable-store';

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
      'startup-redrive-',
    ),
  );

  return new SqliteReliableControlPlaneStore(
    path.join(
      tempDir,
      'cp.db',
    ),
  );
}

describe('Control Plane dead-letter recovery', () => {
  test('redrives a dead-letter message with an auditable recovery record', async () => {
    const cp = store();

    cp.enqueueOutbox({
      messageId: 'msg-dead',
      topic: 'test.redrive',
      partitionKey: 'wf-1',
      createdAt:
        '2026-01-01T00:00:00.000Z',
      availableAt:
        '2026-01-01T00:00:00.000Z',
      retryPolicy: {
        maxAttempts: 1,
        initialDelayMs: 1_000,
        backoffMultiplier: 2,
        maxDelayMs: 10_000,
        timeoutMs: 30_000,
      },
      payload: {},
    });

    let shouldFail = true;

    const registry =
      new OutboxConsumerRegistry();

    registry.register({
      id: 'redrive-consumer',
      topics: ['test.redrive'],
      async handle() {
        if (shouldFail) {
          throw new Error(
            'provider_unavailable',
          );
        }

        return {
          result: {
            deliveredAfterRedrive: true,
          },
        };
      },
    });

    const worker =
      new ReliableOutboxWorker(
        cp,
        registry,
        {
          workerId: 'worker-a',
          batchSize: 10,
          outboxLeaseMs: 10_000,
          consumerLeaseMs: 10_000,
        },
      );

    const failed =
      await worker.runOnce(
        '2026-01-01T00:00:01.000Z',
      );

    expect(failed.failed).toBe(1);

    expect(
      cp.listOutbox()[0],
    ).toMatchObject({
      status: 'dead_letter',
      attempts: 1,
    });

    shouldFail = false;

    cp.redriveDeadLetter(
      {
        redriveId: 'redrive-1',
        messageId: 'msg-dead',
        requestedBy: {
          kind: 'human',
          id: 'ceo',
        },
        requestedAt:
          '2026-01-01T00:00:02.000Z',
        reason:
          'External provider recovered; retry authorized.',
      },
      '2026-01-01T00:00:02.000Z',
    );

    expect(
      cp.listDeadLetterRedrives(
        'msg-dead',
      ),
    ).toHaveLength(1);

    expect(
      cp.listOutbox()[0],
    ).toMatchObject({
      status: 'pending',
      attempts: 0,
    });

    const recovered =
      await worker.runOnce(
        '2026-01-01T00:00:03.000Z',
      );

    expect(
      recovered.succeeded,
    ).toBe(1);

    expect(
      cp.listOutbox()[0],
    ).toMatchObject({
      status: 'published',
    });

    expect(
      cp.getConsumerDeliveryReceipt({
        consumerId:
          'redrive-consumer',
        messageId: 'msg-dead',
      }),
    ).toMatchObject({
      status: 'succeeded',
      attempts: 2,
    });

    cp.close();
  });
});
