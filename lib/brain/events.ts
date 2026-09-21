import { z } from 'zod';

import {
  BrainActorSchema,
  TimestampSchema,
} from '@/lib/brain/core-schema';

import {
  BrainGraphEdgeSchema,
  BrainGraphNodePatchSchema,
  BrainGraphNodeSchema,
  type BrainGraph,
} from '@/lib/brain/graph-schema';

import {
  MemoryStageSchema,
} from '@/lib/brain/memory-schema';

import {
  addEdge,
  addNode,
  getEdge,
  requireNode,
  removeEdge,
  removeNode,
  updateNode,
} from '@/lib/brain/graph-ops';

import {
  reinforceMemoryNode,
  touchMemoryNode,
  transitionMemoryStage,
} from '@/lib/brain/memory-dynamics';

const EventBaseSchema = z.object({
  eventId: z.string().min(1),
  at: TimestampSchema,
  actor: BrainActorSchema,
  reason: z.string().min(1),
  correlationId: z.string().min(1).optional(),
  causationId: z.string().min(1).optional(),
});

const NodeAddedEventSchema = EventBaseSchema.extend({
  type: z.literal('node_added'),
  payload: z.object({
    node: BrainGraphNodeSchema,
  }),
});

const NodeUpdatedEventSchema = EventBaseSchema.extend({
  type: z.literal('node_updated'),
  payload: z.object({
    nodeId: z.string().min(1),
    patch: BrainGraphNodePatchSchema,
  }),
});

const NodeRemovedEventSchema = EventBaseSchema.extend({
  type: z.literal('node_removed'),
  payload: z.object({
    nodeId: z.string().min(1),
    cascade: z.boolean().default(false),
  }),
});

const EdgeAddedEventSchema = EventBaseSchema.extend({
  type: z.literal('edge_added'),
  payload: z.object({
    edge: BrainGraphEdgeSchema,
  }),
});

const EdgeRemovedEventSchema = EventBaseSchema.extend({
  type: z.literal('edge_removed'),
  payload: z.object({
    edgeId: z.string().min(1),
  }),
});

const MemoryAccessedEventSchema = EventBaseSchema.extend({
  type: z.literal('memory_accessed'),
  payload: z.object({
    nodeId: z.string().min(1),
    activationBoost: z.number().finite().min(0).max(1).default(0.25),
  }),
});

const MemoryReinforcedEventSchema = EventBaseSchema.extend({
  type: z.literal('memory_reinforced'),
  payload: z.object({
    nodeId: z.string().min(1),
    amount: z.number().finite().min(0).max(1).default(0.1),
  }),
});

const MemoryStageChangedEventSchema = EventBaseSchema.extend({
  type: z.literal('memory_stage_changed'),
  payload: z.object({
    nodeId: z.string().min(1),
    targetStage: MemoryStageSchema,
  }),
});

const NodeSupersededEventSchema = EventBaseSchema.extend({
  type: z.literal('node_superseded'),
  payload: z.object({
    nodeId: z.string().min(1),
    byNodeId: z.string().min(1),
  }),
});

export const BrainGraphEventSchema = z.discriminatedUnion('type', [
  NodeAddedEventSchema,
  NodeUpdatedEventSchema,
  NodeRemovedEventSchema,
  EdgeAddedEventSchema,
  EdgeRemovedEventSchema,
  MemoryAccessedEventSchema,
  MemoryReinforcedEventSchema,
  MemoryStageChangedEventSchema,
  NodeSupersededEventSchema,
]);

export type BrainGraphEvent = z.infer<typeof BrainGraphEventSchema>;
export type BrainGraphEventInput = z.input<typeof BrainGraphEventSchema>;

export function applyBrainGraphEvent(
  graph: BrainGraph,
  eventInput: BrainGraphEventInput,
): BrainGraph {
  const event = BrainGraphEventSchema.parse(eventInput);

  switch (event.type) {
    case 'node_added':
      return addNode(graph, event.payload.node, event.at);

    case 'node_updated':
      return updateNode(
        graph,
        event.payload.nodeId,
        event.payload.patch,
        event.at,
      );

    case 'node_removed':
      return removeNode(
        graph,
        event.payload.nodeId,
        { cascade: event.payload.cascade },
        event.at,
      );

    case 'edge_added':
      return addEdge(graph, event.payload.edge, event.at);

    case 'edge_removed':
      return removeEdge(graph, event.payload.edgeId, event.at);

    case 'memory_accessed': {
      const node = requireNode(graph, event.payload.nodeId);
      const updated = touchMemoryNode(
        node,
        event.at,
        event.payload.activationBoost,
      );

      return updateNode(
        graph,
        node.id,
        { memory: updated.memory },
        event.at,
      );
    }

    case 'memory_reinforced': {
      const node = requireNode(graph, event.payload.nodeId);
      const updated = reinforceMemoryNode(
        node,
        event.at,
        event.payload.amount,
      );

      return updateNode(
        graph,
        node.id,
        { memory: updated.memory },
        event.at,
      );
    }

    case 'memory_stage_changed': {
      const node = requireNode(graph, event.payload.nodeId);
      const updated = transitionMemoryStage(
        node,
        event.payload.targetStage,
      );

      return updateNode(
        graph,
        node.id,
        { memory: updated.memory },
        event.at,
      );
    }

    case 'node_superseded': {
      const oldNode = requireNode(graph, event.payload.nodeId);
      requireNode(graph, event.payload.byNodeId);

      let next = updateNode(
        graph,
        oldNode.id,
        { status: 'superseded' },
        event.at,
      );

      const edgeId =
        `supersedes:${event.payload.byNodeId}:${event.payload.nodeId}`;

      if (!getEdge(next, edgeId)) {
        next = addEdge(
          next,
          {
            id: edgeId,
            source: event.payload.byNodeId,
            target: event.payload.nodeId,
            type: 'supersedes',
            directed: true,
            strength: 1,
            status: 'active',
            context: {},
            provenance: [],
            metadata: { eventId: event.eventId },
          },
          event.at,
        );
      }

      return next;
    }
  }
}
