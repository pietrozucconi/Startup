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
      'startup-consumers-',
    ),
  );

  return new SqliteReliableControlPlaneStore(
    path.join(
      tempDir,
      'cp.db',
    ),
  );
}

const retryPolicy = {
  maxAttempts: 3,
  initialDelayMs: 1_000,
  backoffMultiplier: 2,
  maxDelayMs: 10_000,
  timeoutMs: 30_000,
};

function enqueue(
  cp: SqliteReliableControlPlaneStore,
  messageId: string,
  topic = 'control-plane.workflow.transitioned',
) {
  cp.enqueueOutbox({
    messageId,
    topic,
    partitionKey: 'wf-1',
    workflowId: 'wf-1',
    createdAt:
      '2026-01-01T00:00:00.000Z',
    availableAt:
      '2026-01-01T00:00:00.000Z',
    retryPolicy,
    payload: {
      eventId: `event:${messageId}`,
    },
  });
}

describe('Reliable outbox consumers', () => {
  test('delivers a message and persists a successful receipt', async () => {
    const cp = store();
    enqueue(cp, 'msg-1');

    const seenKeys: string[] = [];

    const registry =
      new OutboxConsumerRegistry();

    registry.register({
      id: 'test-consumer',
      topics: [
        'control-plane.workflow.transitioned',
      ],
      async handle(context) {
        seenKeys.push(
          context.idempotencyKey,
        );

        return {
          result: {
            handled: true,
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

    const result =
      await worker.runOnce(
        '2026-01-01T00:00:01.000Z',
      );

    expect(result.succeeded).toBe(1);

    expect(seenKeys).toEqual([
      'test-consumer:msg-1',
    ]);

    expect(
      cp.listOutbox()[0],
    ).toMatchObject({
      status: 'published',
    });

    expect(
      cp.getConsumerDeliveryReceipt({
        consumerId:
          'test-consumer',
        messageId: 'msg-1',
      }),
    ).toMatchObject({
      status: 'succeeded',
      attempts: 1,
      result: {
        handled: true,
      },
    });

    cp.close();
  });

  test('does not execute the handler again after receipt success if process crashed before outbox acknowledgement', async () => {
    const cp = store();
    enqueue(cp, 'msg-crash');

    const firstClaim =
      cp.claimOutbox({
        workerId: 'worker-old',
        now:
          '2026-01-01T00:00:01.000Z',
        limit: 1,
        leaseMs: 1_000,
      });

    expect(firstClaim).toHaveLength(1);

    const delivery =
      cp.claimConsumerDelivery({
        consumerId:
          'test-consumer',
        messageId: 'msg-crash',
        topic:
          'control-plane.workflow.transitioned',
        workerId: 'worker-old',
        now:
          '2026-01-01T00:00:01.000Z',
        leaseMs: 1_000,
      });

    expect(
      delivery.outcome,
    ).toBe('claimed');

    cp.completeConsumerDelivery({
      consumerId:
        'test-consumer',
      messageId: 'msg-crash',
      workerId: 'worker-old',
      completedAt:
        '2026-01-01T00:00:01.500Z',
      result: {
        sideEffectCompleted: true,
      },
    });

    /*
     * Simulated crash:
     * receipt succeeded, but acknowledgeOutbox was never called.
     */

    let handlerCalls = 0;

    const registry =
      new OutboxConsumerRegistry();

    registry.register({
      id: 'test-consumer',
      topics: [
        'control-plane.workflow.transitioned',
      ],
      async handle() {
        handlerCalls += 1;
        return {};
      },
    });

    const worker =
      new ReliableOutboxWorker(
        cp,
        registry,
        {
          workerId: 'worker-new',
          batchSize: 10,
          outboxLeaseMs: 10_000,
          consumerLeaseMs: 10_000,
        },
      );

    const result =
      await worker.runOnce(
        '2026-01-01T00:00:03.000Z',
      );

    expect(
      result.deduplicated,
    ).toBe(1);

    expect(handlerCalls).toBe(0);

    expect(
      cp.listOutbox()[0],
    ).toMatchObject({
      status: 'published',
      attempts: 2,
    });

    cp.close();
  });

  test('retries a failed consumer and later succeeds with the same stable idempotency key', async () => {
    const cp = store();
    enqueue(cp, 'msg-retry');

    const keys: string[] = [];
    let calls = 0;

    const registry =
      new OutboxConsumerRegistry();

    registry.register({
      id: 'retry-consumer',
      topics: [
        'control-plane.workflow.transitioned',
      ],
      async handle(context) {
        calls += 1;
        keys.push(
          context.idempotencyKey,
        );

        if (calls === 1) {
          throw new Error(
            'temporary_failure',
          );
        }

        return {
          result: {
            recovered: true,
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

    const first =
      await worker.runOnce(
        '2026-01-01T00:00:01.000Z',
      );

    expect(first.failed).toBe(1);

    const second =
      await worker.runOnce(
        '2026-01-01T00:00:02.000Z',
      );

    expect(second.succeeded).toBe(1);

    expect(keys).toEqual([
      'retry-consumer:msg-retry',
      'retry-consumer:msg-retry',
    ]);

    expect(
      cp.getConsumerDeliveryReceipt({
        consumerId:
          'retry-consumer',
        messageId: 'msg-retry',
      }),
    ).toMatchObject({
      status: 'succeeded',
      attempts: 2,
    });

    cp.close();
  });

  test('refuses multiple consumers for the same topic', () => {
    const registry =
      new OutboxConsumerRegistry();

    registry.register({
      id: 'consumer-a',
      topics: ['topic-a'],
      async handle() {
        return {};
      },
    });

    expect(() =>
      registry.register({
        id: 'consumer-b',
        topics: ['topic-a'],
        async handle() {
          return {};
        },
      }),
    ).toThrow(
      'consumer_topic_already_registered',
    );
  });
});
