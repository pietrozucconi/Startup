import { PageHeader } from '@/components/PageHeader';
import { StartupBrain3D } from '@/components/StartupBrain3D';

export const dynamic = 'force-dynamic';

export default function BrainPage() {
  return (
    <div>
      <PageHeader
        eyebrow="institutional memory"
        title="Startup Brain"
      />

      <StartupBrain3D />

      <section className="mt-4 grid grid-cols-4 gap-3 max-[1000px]:grid-cols-2 max-[650px]:grid-cols-1">
        <div className="rounded-lg-t border border-os-border bg-os-surface p-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-os-dim">
            Startup Memory
          </div>
          <div className="mt-2 text-sm font-semibold">Structural bootstrap</div>
          <p className="mt-1 text-xs leading-relaxed text-os-muted">
            Company identity, governance, policies, agent instructions, runtime profiles, tools and model assignments.
          </p>
        </div>

        <div className="rounded-lg-t border border-os-border bg-os-surface p-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-os-dim">
            Startup Brain
          </div>
          <div className="mt-2 text-sm font-semibold">Experiential memory</div>
          <p className="mt-1 text-xs leading-relaxed text-os-muted">
            Starts empty and grows only from real company reasoning, decisions, outcomes, reviews, errors and validated learning.
          </p>
        </div>

        <div className="rounded-lg-t border border-os-border bg-os-surface p-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-os-dim">
            Retrieval
          </div>
          <div className="mt-2 text-sm font-semibold">Selective only</div>
          <p className="mt-1 text-xs leading-relaxed text-os-muted">
            Keyword, semantic, contextual and graph-based retrieval through the Brain Gateway. Never a full dump.
          </p>
        </div>

        <div className="rounded-lg-t border border-os-border bg-os-surface p-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-os-dim">
            Operational memory
          </div>
          <div className="mt-2 text-2xl font-semibold">0</div>
          <p className="mt-1 text-xs leading-relaxed text-os-muted">
            No fabricated experiences, decisions or lessons before the company starts operating.
          </p>
        </div>
      </section>
    </div>
  );
}
