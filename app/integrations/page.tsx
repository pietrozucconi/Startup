import {
  PageHeader,
} from '@/components/PageHeader';

import {
  InfrastructureHealthPanel,
} from '@/components/InfrastructureHealthPanel';

import {
  buildInfrastructureHealthSnapshot,
} from '@/lib/control-plane/infrastructure-health';


export const dynamic =
  'force-dynamic';


export default async function ConnectionsPage() {
  const health =
    await buildInfrastructureHealthSnapshot();


  return (
    <div>
      <PageHeader
        eyebrow="infrastructure"
        title="Connections"
      />

      <div className="mb-8 max-w-3xl">
        <p className="text-sm leading-relaxed text-os-muted">
          Live infrastructure status for the systems powering the AI company.
        </p>

        <p className="mt-2 text-sm leading-relaxed text-os-dim">
          Service health is monitored continuously from real runtime telemetry.
        </p>
      </div>


      <InfrastructureHealthPanel
        initialHealth={
          health
        }
      />
    </div>
  );
}