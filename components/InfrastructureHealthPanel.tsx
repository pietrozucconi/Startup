'use client';

import {
  useEffect,
  useState,
} from 'react';

import {
  Activity,
  Brain,
  Database,
  Globe2,
  Plug,
  Route,
} from 'lucide-react';

import type {
  InfrastructureHealthSnapshot,
  InfrastructureServiceHealth,
  InfrastructureStatus,
} from '@/lib/control-plane/infrastructure-health';


function statusLabel(
  status: InfrastructureStatus,
): string {
  switch (status) {
    case 'connected':
      return 'Connected';

    case 'degraded':
      return 'Degraded';

    case 'offline':
      return 'Offline';
  }
}


function statusClass(
  status: InfrastructureStatus,
): string {
  switch (status) {
    case 'connected':
      return 'text-os-ok';

    case 'degraded':
      return 'text-os-warn';

    case 'offline':
      return 'text-os-danger';
  }
}


function HealthStatus({
  health,
}: {
  health:
    InfrastructureServiceHealth;
}) {
  return (
    <div className="mt-4">
      <div
        className={`font-mono text-[10px] uppercase tracking-[0.18em] ${statusClass(
          health.status,
        )}`}
      >
        ● {statusLabel(health.status)}
      </div>

      {health.reason ? (
        <div className="mt-2 font-mono text-[9px] text-os-dim">
          {health.reason}
        </div>
      ) : null}
    </div>
  );
}


export function InfrastructureHealthPanel({
  initialHealth,
}: {
  initialHealth:
    InfrastructureHealthSnapshot;
}) {
  const [
    health,
    setHealth,
  ] =
    useState(
      initialHealth,
    );


  const [
    refreshFailed,
    setRefreshFailed,
  ] =
    useState(
      false,
    );


  useEffect(
    () => {
      let cancelled =
        false;


      const refresh =
        async () => {
          try {
            const response =
              await fetch(
                '/api/runtime/health',
                {
                  cache:
                    'no-store',
                },
              );


            if (
              !response.ok
            ) {
              throw new Error(
                `health_request_failed:${response.status}`,
              );
            }


            const nextHealth =
              await response.json() as
                InfrastructureHealthSnapshot;


            if (
              !cancelled
            ) {
              setHealth(
                nextHealth,
              );

              setRefreshFailed(
                false,
              );
            }
          } catch {
            if (
              !cancelled
            ) {
              setRefreshFailed(
                true,
              );
            }
          }
        };


      const interval =
        window.setInterval(
          refresh,
          5000,
        );


      return () => {
        cancelled =
          true;

        window.clearInterval(
          interval,
        );
      };
    },
    [],
  );


  return (
    <>
      {refreshFailed ? (
        <section className="mb-4 border border-os-warn p-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-os-warn">
            Health telemetry refresh failed
          </div>

          <div className="mt-1 text-xs text-os-dim">
            Displaying the last successful infrastructure snapshot.
          </div>
        </section>
      ) : null}


      <section className="mb-6 grid grid-cols-4 gap-3 max-[1100px]:grid-cols-2 max-[650px]:grid-cols-1">
        <div className="rounded-lg-t border border-os-border bg-os-surface p-4">
          <Activity
            className={`h-4 w-4 ${statusClass(
              health.overall,
            )}`}
          />

          <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-os-dim">
            Infrastructure
          </div>

          <div
            className={`mt-2 text-sm font-semibold ${statusClass(
              health.overall,
            )}`}
          >
            {statusLabel(
              health.overall,
            )}
          </div>
        </div>


        <div className="rounded-lg-t border border-os-border bg-os-surface p-4">
          <Brain className="h-4 w-4 text-os-muted" />

          <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-os-dim">
            Startup Brain
          </div>

          <div className="mt-2 text-sm font-semibold">
            Cognee
          </div>

          <HealthStatus
            health={
              health.cognee
            }
          />
        </div>


        <div className="rounded-lg-t border border-os-border bg-os-surface p-4">
          <Route className="h-4 w-4 text-os-muted" />

          <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-os-dim">
            Model Gateway
          </div>

          <div className="mt-2 text-sm font-semibold">
            OmniRoute
          </div>

          <HealthStatus
            health={
              health.omniroute
            }
          />
        </div>


        <div className="rounded-lg-t border border-os-border bg-os-surface p-4">
          <Plug className="h-4 w-4 text-os-muted" />

          <div className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-os-dim">
            Company Runtime
          </div>

          <div className="mt-2 text-sm font-semibold">
            Agent Worker
          </div>

          <HealthStatus
            health={
              health.companyRuntime
            }
          />
        </div>
      </section>


      <section className="grid grid-cols-2 gap-3 max-[900px]:grid-cols-1">
        <div className="rounded-lg-t border border-os-border bg-os-surface p-5">
          <Database className="h-5 w-5 text-os-muted" />

          <div className="mt-4 text-sm font-semibold">
            Control Plane
          </div>

          <p className="mt-2 text-xs leading-relaxed text-os-dim">
            Durable workflows, tasks, handoffs, governance and runtime
            coordination.
          </p>

          <HealthStatus
            health={
              health.controlPlane
            }
          />

          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="border border-os-border p-3">
              <div className="font-mono text-[9px] uppercase text-os-dim">
                Workflows
              </div>

              <div className="mt-1 text-lg font-semibold">
                {String(
                  health.controlPlane
                    .metadata
                    ?.workflows ??
                    0,
                )}
              </div>
            </div>

            <div className="border border-os-border p-3">
              <div className="font-mono text-[9px] uppercase text-os-dim">
                Dead letters
              </div>

              <div className="mt-1 text-lg font-semibold">
                {String(
                  health.controlPlane
                    .metadata
                    ?.deadLetters ??
                    0,
                )}
              </div>
            </div>
          </div>
        </div>


        <div className="rounded-lg-t border border-os-border bg-os-surface p-5">
          <Globe2 className="h-5 w-5 text-os-muted" />

          <div className="mt-4 text-sm font-semibold">
            External Research & Market Data
          </div>

          <p className="mt-2 text-xs leading-relaxed text-os-dim">
            Web research, market prices, fundamentals, filings and external
            information sources.
          </p>

          <div className="mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-os-dim">
            Not configured
          </div>
        </div>
      </section>


      <section className="mt-6 rounded-lg-t border border-os-border bg-os-surface p-5">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-os-dim">
          Runtime details
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3 max-[900px]:grid-cols-1">
          <div>
            <div className="font-mono text-[9px] uppercase text-os-dim">
              Brain dataset
            </div>

            <div className="mt-1 text-xs text-os-muted">
              {String(
                health.cognee
                  .metadata
                  ?.dataset ??
                  '—',
              )}
            </div>
          </div>

          <div>
            <div className="font-mono text-[9px] uppercase text-os-dim">
              OmniRoute models
            </div>

            <div className="mt-1 text-xs text-os-muted">
              {String(
                health.omniroute
                  .metadata
                  ?.selectableModels ??
                  '—',
              )}
            </div>
          </div>

          <div>
            <div className="font-mono text-[9px] uppercase text-os-dim">
              Runtime PID
            </div>

            <div className="mt-1 text-xs text-os-muted">
              {String(
                health.companyRuntime
                  .metadata
                  ?.processId ??
                  '—',
              )}
            </div>
          </div>
        </div>


        <div className="mt-4 flex items-center gap-2 font-mono text-[9px] text-os-dim">
          <span
            className={
              refreshFailed
                ? 'text-os-warn'
                : 'text-os-ok'
            }
          >
            ●
          </span>

          Live health · last check: {health.checkedAt}
        </div>
      </section>
    </>
  );
}