import type {
  RuntimeObservabilityEvent,
} from '@/lib/control-plane/hardened-runtime-schema';

import type {
  HardenedRuntimeStore,
} from '@/lib/control-plane/hardened-runtime-store';

/**
 * Export hook for future Langfuse / OpenTelemetry adapters.
 * Durable company telemetry remains the source of truth.
 */
export interface RuntimeObservabilityExporter {
  id: string;

  export(
    events: RuntimeObservabilityEvent[],
  ): Promise<void>;
}

export class StoreBackedRuntimeObservabilityReader {
  constructor(
    private readonly store: HardenedRuntimeStore,
  ) {}

  listAll(): RuntimeObservabilityEvent[] {
    return this.store.listRuntimeObservabilityEvents();
  }

  async exportAll(
    exporter: RuntimeObservabilityExporter,
  ): Promise<number> {
    const events = this.listAll();

    await exporter.export(events);

    return events.length;
  }
}
