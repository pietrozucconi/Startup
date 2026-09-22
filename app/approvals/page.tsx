import {
  Bell,
  CheckCircle2,
  ShieldAlert,
} from 'lucide-react';

import {
  PageHeader,
} from '@/components/PageHeader';

import {
  getControlPlaneRuntimeStore,
} from '@/lib/control-plane/runtime-data';

import {
  acknowledgeCeoInboxAction,
  approveResearchAction,
  confirmManualExecutionAction,
  rejectResearchAction,
} from '@/lib/control-plane/operator-actions';

export const dynamic =
  'force-dynamic';

function iconFor(
  category: string,
) {
  if (
    category ===
    'security_alert'
  ) {
    return ShieldAlert;
  }

  if (
    category ===
    'approval_request'
  ) {
    return CheckCircle2;
  }

  return Bell;
}

export default function ApprovalsPage() {
  const store =
    getControlPlaneRuntimeStore();

  const items =
    store.listCeoInbox();

  const unresolved =
    items.filter(
      (item) =>
        item.status !==
        'resolved',
    );

  return (
    <div>
      <PageHeader
        eyebrow="human authority"
        title="CEO Inbox"
      />

      <div className="mb-6 max-w-3xl">
        <p className="text-sm leading-relaxed text-os-muted">
          Governed approval requests, notifications and security alerts
          addressed to the human CEO.
        </p>

        <p className="mt-2 text-sm leading-relaxed text-os-dim">
          Decision buttons below do not edit workflow state directly. They
          submit normal artifacts and transition requests to the deterministic
          Control Plane, which applies the same permissions and gates as every
          other company action.
        </p>
      </div>

      <section className="mb-6 grid grid-cols-3 gap-3 max-[800px]:grid-cols-1">
        <div className="rounded-lg-t border border-os-border bg-os-surface p-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-os-dim">
            Unresolved
          </div>
          <div className="mt-2 text-2xl font-semibold">
            {unresolved.length}
          </div>
        </div>

        <div className="rounded-lg-t border border-os-border bg-os-surface p-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-os-dim">
            Approval requests
          </div>
          <div className="mt-2 text-2xl font-semibold">
            {
              items.filter(
                (item) =>
                  item.category ===
                    'approval_request' &&
                  item.status !==
                    'resolved',
              ).length
            }
          </div>
        </div>

        <div className="rounded-lg-t border border-os-border bg-os-surface p-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-os-dim">
            Security alerts
          </div>
          <div className="mt-2 text-2xl font-semibold">
            {
              items.filter(
                (item) =>
                  item.category ===
                    'security_alert' &&
                  item.status !==
                    'resolved',
              ).length
            }
          </div>
        </div>
      </section>

      {items.length === 0 ? (
        <section className="rounded-lg-t border border-dashed border-os-border p-6">
          <div className="text-sm font-semibold">
            CEO inbox is empty
          </div>

          <p className="mt-2 text-sm text-os-muted">
            No human approval request or operator alert has been produced by a
            governed workflow yet.
          </p>
        </section>
      ) : (
        <section className="space-y-3">
          {items.map((item) => {
            const Icon =
              iconFor(
                item.category,
              );

            return (
              <article
                key={item.inboxId}
                className="rounded-lg-t border border-os-border bg-os-surface p-4"
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-os-border bg-os-surface2">
                    <Icon className="h-4 w-4 text-os-muted" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap gap-2 font-mono text-[9px] uppercase tracking-[0.16em]">
                      <span className="text-os-dim">
                        {item.category}
                      </span>
                      <span className="text-os-muted">
                        {item.status}
                      </span>
                    </div>

                    <div className="mt-2 text-sm font-semibold">
                      {item.summary}
                    </div>

                    <div className="mt-2 break-all font-mono text-[10px] text-os-dim">
                      action: {item.action}
                      {item.workflowId
                        ? ` · workflow: ${item.workflowId}`
                        : ''}
                      {item.stateAtCreation
                        ? ` · state: ${item.stateAtCreation}`
                        : ''}
                    </div>

                    {item.status ===
                      'pending' && (
                      <form
                        action={
                          acknowledgeCeoInboxAction
                        }
                        className="mt-4"
                      >
                        <input
                          type="hidden"
                          name="inboxId"
                          value={
                            item.inboxId
                          }
                        />

                        <button
                          type="submit"
                          className="rounded-sm-t border border-os-border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-os-muted hover:border-os-border-strong hover:text-os-text"
                        >
                          Acknowledge
                        </button>
                      </form>
                    )}

                    {item.status !==
                      'resolved' &&
                      item.action ===
                        'decide_research_proposal' && (
                        <div className="mt-5 grid grid-cols-2 gap-3 max-[850px]:grid-cols-1">
                          <form
                            action={
                              approveResearchAction
                            }
                            className="border border-os-border p-3"
                          >
                            <input
                              type="hidden"
                              name="inboxId"
                              value={
                                item.inboxId
                              }
                            />

                            <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-os-dim">
                              Approve for risk analysis
                            </div>

                            <textarea
                              name="reason"
                              required
                              rows={3}
                              placeholder="CEO decision rationale"
                              className="mt-3 w-full resize-y border border-os-border bg-os-bg p-2 text-xs text-os-text outline-none focus:border-os-border-strong"
                            />

                            <button
                              type="submit"
                              className="mt-3 border border-os-border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-os-muted hover:border-os-border-strong hover:text-os-text"
                            >
                              Approve research
                            </button>
                          </form>

                          <form
                            action={
                              rejectResearchAction
                            }
                            className="border border-os-border p-3"
                          >
                            <input
                              type="hidden"
                              name="inboxId"
                              value={
                                item.inboxId
                              }
                            />

                            <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-os-dim">
                              Reject proposal
                            </div>

                            <textarea
                              name="reason"
                              required
                              rows={3}
                              placeholder="CEO rejection rationale"
                              className="mt-3 w-full resize-y border border-os-border bg-os-bg p-2 text-xs text-os-text outline-none focus:border-os-border-strong"
                            />

                            <button
                              type="submit"
                              className="mt-3 border border-os-border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-os-muted hover:border-os-border-strong hover:text-os-text"
                            >
                              Reject research
                            </button>
                          </form>
                        </div>
                      )}

                    {item.status !==
                      'resolved' &&
                      item.action ===
                        'perform_manual_execution_decision' && (
                        <form
                          action={
                            confirmManualExecutionAction
                          }
                          className="mt-5 border border-os-border p-3"
                        >
                          <div className="font-mono text-[9px] uppercase tracking-[0.16em] text-os-dim">
                            Record completed manual execution
                          </div>

                          <p className="mt-2 text-xs leading-relaxed text-os-muted">
                            Use this only after you have personally executed the
                            approved trade outside Startup. This form records the
                            observed execution; it does not send an order.
                          </p>

                          <input
                            type="hidden"
                            name="inboxId"
                            value={
                              item.inboxId
                            }
                          />

                          <div className="mt-3 grid grid-cols-4 gap-2 max-[850px]:grid-cols-2 max-[520px]:grid-cols-1">
                            <input
                              name="executionPrice"
                              type="number"
                              step="any"
                              min="0"
                              required
                              placeholder="Execution price"
                              className="border border-os-border bg-os-bg px-3 py-2 text-xs outline-none focus:border-os-border-strong"
                            />

                            <input
                              name="quantity"
                              type="number"
                              step="any"
                              min="0"
                              required
                              placeholder="Quantity"
                              className="border border-os-border bg-os-bg px-3 py-2 text-xs outline-none focus:border-os-border-strong"
                            />

                            <input
                              name="fees"
                              type="number"
                              step="any"
                              min="0"
                              placeholder="Fees (optional)"
                              className="border border-os-border bg-os-bg px-3 py-2 text-xs outline-none focus:border-os-border-strong"
                            />

                            <input
                              name="currency"
                              maxLength={16}
                              placeholder="Currency"
                              className="border border-os-border bg-os-bg px-3 py-2 text-xs outline-none focus:border-os-border-strong"
                            />
                          </div>

                          <textarea
                            name="note"
                            rows={2}
                            maxLength={2000}
                            placeholder="Execution note (optional)"
                            className="mt-2 w-full resize-y border border-os-border bg-os-bg p-2 text-xs outline-none focus:border-os-border-strong"
                          />

                          <button
                            type="submit"
                            className="mt-3 border border-os-border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] text-os-muted hover:border-os-border-strong hover:text-os-text"
                          >
                            Confirm manual execution
                          </button>
                        </form>
                      )}
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
