import { z } from 'zod';

import {
  TimestampSchema,
} from '@/lib/brain/core-schema';

export const RetryPolicySchema = z.object({
  maxAttempts: z.number().int().positive(),
  initialDelayMs: z.number().int().min(0),
  backoffMultiplier: z.number().finite().min(1),
  maxDelayMs: z.number().int().min(0),
  timeoutMs: z.number().int().positive(),
});

export const ScheduledJobStatusSchema = z.enum([
  'scheduled',
  'running',
  'succeeded',
  'failed',
  'cancelled',
  'timed_out',
]);

export const ScheduledJobSchema = z.object({
  id: z.string().min(1),
  workflowId: z.string().min(1).optional(),
  kind: z.string().min(1),
  runAt: TimestampSchema,
  status: ScheduledJobStatusSchema.default(
    'scheduled',
  ),
  attempts: z.number().int().min(0).default(0),
  startedAt: TimestampSchema.optional(),
  completedAt: TimestampSchema.optional(),
  retryPolicy: RetryPolicySchema,
  metadata: z.record(z.unknown()).default({}),
});

export type RetryPolicy = z.infer<
  typeof RetryPolicySchema
>;

export type ScheduledJob = z.infer<
  typeof ScheduledJobSchema
>;

export function computeRetryDelayMs(
  policy: RetryPolicy,
  failedAttemptNumber: number,
): number {
  if (failedAttemptNumber <= 0) {
    return 0;
  }

  const raw =
    policy.initialDelayMs *
    Math.pow(
      policy.backoffMultiplier,
      failedAttemptNumber - 1,
    );

  return Math.min(
    policy.maxDelayMs,
    Math.round(raw),
  );
}

export function canRetryJob(
  job: ScheduledJob,
): boolean {
  return (
    job.status === 'failed' &&
    job.attempts < job.retryPolicy.maxAttempts
  );
}

export function isJobTimedOut(
  job: ScheduledJob,
  now: string,
): boolean {
  if (
    job.status !== 'running' ||
    !job.startedAt
  ) {
    return false;
  }

  return (
    Date.parse(now) -
      Date.parse(job.startedAt) >=
    job.retryPolicy.timeoutMs
  );
}

export function nextRetryAt(
  job: ScheduledJob,
  now: string,
): string | null {
  if (!canRetryJob(job)) {
    return null;
  }

  const delay = computeRetryDelayMs(
    job.retryPolicy,
    job.attempts,
  );

  return new Date(
    Date.parse(now) + delay,
  ).toISOString();
}
