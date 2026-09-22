'use server';

import {
  revalidatePath,
} from 'next/cache';

import {
  GovernedCeoDecisionService,
} from '@/lib/control-plane/ceo-decision-service';

import {
  getControlPlaneRuntimeStore,
} from '@/lib/control-plane/runtime-data';

function requiredField(
  formData: FormData,
  key: string,
): string {
  const raw =
    formData.get(key);

  if (
    typeof raw !== 'string' ||
    !raw.trim()
  ) {
    throw new Error(
      `operator_action_missing_field:${key}`,
    );
  }

  return raw.trim();
}

function optionalField(
  formData: FormData,
  key: string,
): string | undefined {
  const raw =
    formData.get(key);

  if (
    typeof raw !== 'string'
  ) {
    return undefined;
  }

  const value =
    raw.trim();

  return value
    ? value
    : undefined;
}

function refresh() {
  [
    '/tasks',
    '/approvals',
    '/workflows',
    '/control-plane',
  ].forEach((path) => {
    revalidatePath(path);
  });
}

function ceoService() {
  const store =
    getControlPlaneRuntimeStore();

  return new GovernedCeoDecisionService(
    store,
  );
}

export async function acknowledgeCeoInboxAction(
  formData: FormData,
) {
  const inboxId =
    requiredField(
      formData,
      'inboxId',
    );

  getControlPlaneRuntimeStore()
    .acknowledgeCeoInboxItem({
      inboxId,
      acknowledgedAt:
        new Date().toISOString(),
    });

  refresh();
}

export async function approveResearchAction(
  formData: FormData,
) {
  await ceoService().decideResearch({
    inboxId:
      requiredField(
        formData,
        'inboxId',
      ),
    decision: 'approved',
    reason:
      requiredField(
        formData,
        'reason',
      ),
  });

  refresh();
}

export async function rejectResearchAction(
  formData: FormData,
) {
  await ceoService().decideResearch({
    inboxId:
      requiredField(
        formData,
        'inboxId',
      ),
    decision: 'rejected',
    reason:
      requiredField(
        formData,
        'reason',
      ),
  });

  refresh();
}

export async function confirmManualExecutionAction(
  formData: FormData,
) {
  await ceoService().confirmManualExecution({
    inboxId:
      requiredField(
        formData,
        'inboxId',
      ),

    executionPrice:
        Number(
            requiredField(
                formData,
                'executionPrice',
            ),
        ),

    quantity:
        Number(
            requiredField(
            formData,
            'quantity',
            ),
        ),

    fees: (() => {
        const value =
            optionalField(
                formData,
                'fees',
            );

        return value === undefined
            ? undefined
            : Number(value);
    })(),  
    
    currency:
      optionalField(
        formData,
        'currency',
      ),
    note:
      optionalField(
        formData,
        'note',
      ),
  });

  refresh();
}

export async function redriveAgentTaskAction(
  formData: FormData,
) {
  const taskId =
    requiredField(
      formData,
      'taskId',
    );

  const reason =
    requiredField(
      formData,
      'reason',
    );

  getControlPlaneRuntimeStore()
    .redriveAgentRuntimeTask({
      taskId,
      requestedAt:
        new Date().toISOString(),
      reason,
    });

  refresh();
}

export async function redriveHandoffAction(
  formData: FormData,
) {
  const handoffId =
    requiredField(
      formData,
      'handoffId',
    );

  const reason =
    requiredField(
      formData,
      'reason',
    );

  getControlPlaneRuntimeStore()
    .redriveHandoff({
      handoffId,
      requestedAt:
        new Date().toISOString(),
      reason,
    });

  refresh();
}

export async function redriveOutboxAction(
  formData: FormData,
) {
  const messageId =
    requiredField(
      formData,
      'messageId',
    );

  const reason =
    requiredField(
      formData,
      'reason',
    );

  const now =
    new Date().toISOString();

  getControlPlaneRuntimeStore()
    .redriveDeadLetter(
      {
        redriveId:
          `operator-redrive:${messageId}:${now}`,
        messageId,
        requestedBy: {
          kind: 'human',
          id: 'ceo',
        },
        requestedAt: now,
        reason,
      },
      now,
    );

  refresh();
}
