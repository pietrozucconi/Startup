import type {
  ControlPlaneCommandRecord,
  ControlPlaneDomainEvent,
  ControlPlaneOutboxMessage,
  DurableScheduledJob,
  ClaimBatchInput,
  ControlPlaneOutboxMessageInput,
  DurableScheduledJobInput,
} from '@/lib/control-plane/durable-schema';

export interface ControlPlaneCommandLedger {
  appendCommand(
    record: ControlPlaneCommandRecord,
  ): void;

  listCommands(
    workflowId?: string,
  ): ControlPlaneCommandRecord[];
}

export interface ControlPlaneDomainEventLedger {
  appendDomainEvent(
    event: ControlPlaneDomainEvent,
  ): void;

  listDomainEvents(
    workflowId?: string,
  ): ControlPlaneDomainEvent[];
}

export interface ControlPlaneOutboxStore {
  enqueueOutbox(
    message: ControlPlaneOutboxMessageInput,
  ): void;

  listOutbox(): ControlPlaneOutboxMessage[];

  claimOutbox(
    input: ClaimBatchInput,
  ): ControlPlaneOutboxMessage[];

  acknowledgeOutbox(input: {
    messageId: string;
    workerId: string;
    publishedAt: string;
  }): void;

  failOutbox(input: {
    messageId: string;
    workerId: string;
    failedAt: string;
    error: string;
  }): ControlPlaneOutboxMessage;
}

export interface ControlPlaneJobStore {
   scheduleJob(
    job: DurableScheduledJobInput,
  ): void;

  listJobs(): DurableScheduledJob[];

  claimDueJobs(
    input: ClaimBatchInput,
  ): DurableScheduledJob[];

  completeJob(input: {
    jobId: string;
    workerId: string;
    completedAt: string;
  }): void;

  failJob(input: {
    jobId: string;
    workerId: string;
    failedAt: string;
    error: string;
  }): DurableScheduledJob;

  cancelJob(input: {
    jobId: string;
  }): void;
}
