import type {
  BrainGraph,
} from '@/lib/brain/graph-schema';

import type {
  BrainGraphEvent,
  BrainGraphEventInput,
} from '@/lib/brain/events';

import {
  applyBrainGraphEvent,
} from '@/lib/brain/events';

import {
  BrainGraphSchema,
} from '@/lib/brain/graph-schema';

import {
  BrainAuditRecordSchema,
  type BrainAuditRecord,
} from '@/lib/brain/gateway/schema';

export interface BrainGraphStore {
  getSnapshot(): Promise<BrainGraph>;

  commitEvents(input: {
    events: BrainGraphEventInput[];
    expectedRevision?: number;
  }): Promise<BrainGraph>;
}

export interface BrainAuditStore {
  append(record: BrainAuditRecord): Promise<void>;
  list(): Promise<BrainAuditRecord[]>;
}

export class InMemoryBrainGraphStore
  implements BrainGraphStore
{
  private graph: BrainGraph;

  constructor(initialGraph: BrainGraph) {
    this.graph = BrainGraphSchema.parse(initialGraph);
  }

  async getSnapshot(): Promise<BrainGraph> {
    return structuredClone(this.graph);
  }

  async commitEvents(input: {
    events: BrainGraphEventInput[];
    expectedRevision?: number;
  }): Promise<BrainGraph> {
    if (
      input.expectedRevision !== undefined &&
      input.expectedRevision !== this.graph.revision
    ) {
      throw new Error(
        `brain_revision_conflict:expected=${input.expectedRevision}:actual=${this.graph.revision}`,
      );
    }

    let next = this.graph;

    for (const event of input.events) {
      next = applyBrainGraphEvent(next, event);
    }

    this.graph = BrainGraphSchema.parse(next);

    return structuredClone(this.graph);
  }
}

export class InMemoryBrainAuditStore
  implements BrainAuditStore
{
  private readonly records: BrainAuditRecord[] = [];

  async append(record: BrainAuditRecord): Promise<void> {
    this.records.push(
      BrainAuditRecordSchema.parse(record),
    );
  }

  async list(): Promise<BrainAuditRecord[]> {
    return structuredClone(this.records);
  }
}
