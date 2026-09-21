import type {
  Agent,
  Department,
} from '@/lib/schemas';

import {
  BrainGraphSchema,
  type BrainGraph,
  type BrainGraphEdgeInput,
  type BrainGraphNodeInput,
} from '@/lib/brain/graph-schema';

export const STARTUP_BRAIN_NODE_ID = 'startup-brain';

function structuralMemory() {
  return {
    system: 'structural' as const,
    stage: 'structural' as const,
    salience: {},
    activation: 0,
    retentionStrength: 1,
    consolidationScore: 1,
    accessCount: 0,
    rehearsalCount: 0,
    retentionLock: true,
    pendingReview: false,
  };
}

/**
 * Builds the canonical structural graph of the company.
 *
 * It contains no investment history, no fabricated decisions,
 * no performance records and no synthetic Startup Brain memory.
 */
export function buildFoundationBrainGraph(
  departments: Department[],
  agents: Agent[],
  generatedAt = new Date().toISOString(),
): BrainGraph {
  const orderedDepartments = [...departments].sort(
    (a, b) => a.order - b.order,
  );

  const orderedAgents = [...agents].sort(
    (a, b) => a.name.localeCompare(b.name),
  );

  const nodes: BrainGraphNodeInput[] = [
    {
      id: STARTUP_BRAIN_NODE_ID,
      type: 'brain',
      label: 'Startup Brain',
      summary:
        'Company-wide institutional memory and semantic knowledge graph.',
      status: 'active',
      canonicalKey: 'startup-brain',
      tags: ['institutional-memory'],
      keywords: ['memory', 'knowledge', 'learning'],
      context: {},
      memory: structuralMemory(),
      governance: {
        visibility: 'internal',
        immutable: true,
      },
      audit: {},
      metadata: {
        provider: 'unbound',
        cogneeStatus: 'planned',
      },
    },

    ...orderedDepartments.map(
      (department): BrainGraphNodeInput => ({
        id: department.id,
        type: 'department',
        label: department.name,
        summary: department.tagline,
        status: 'active',
        canonicalKey: department.slug,
        tags: ['department'],
        context: {
          departmentIds: [department.id],
        },
        memory: structuralMemory(),
        governance: {},
        audit: {},
        metadata: {
          slug: department.slug,
          color: department.color,
          order: department.order,
        },
      }),
    ),

    ...orderedAgents.map(
      (agent): BrainGraphNodeInput => ({
        id: agent.id,
        type: 'agent',
        label: agent.name,
        summary: agent.description,
        content: agent.role,
        status: agent.status === 'planned' ? 'planned' : 'active',
        canonicalKey: agent.id,
        tags: ['agent', agent.tier],
        keywords: [agent.role, ...agent.tools],
        context: {
          departmentIds: [agent.departmentId],
          agentIds: [agent.id],
        },
        memory: structuralMemory(),
        governance: {},
        audit: {},
        metadata: {
          role: agent.role,
          tier: agent.tier,
          model: agent.model,
          tools: agent.tools,
          parentId: agent.parentId,
          instance: agent.instance,
        },
      }),
    ),
  ];

  const edges: BrainGraphEdgeInput[] = [];

  for (const department of orderedDepartments) {
    edges.push({
      id: `brain-memory:${department.id}`,
      source: STARTUP_BRAIN_NODE_ID,
      target: department.id,
      type: 'shares_memory_with',
      directed: false,
      strength: 1,
      confidence: 1,
      status: 'active',
      context: {
        departmentIds: [department.id],
      },
      provenance: [],
      metadata: { structural: true },
    });
  }

  for (const agent of orderedAgents) {
    edges.push({
      id: `agent-department:${agent.id}:${agent.departmentId}`,
      source: agent.id,
      target: agent.departmentId,
      type: 'belongs_to',
      directed: true,
      strength: 1,
      confidence: 1,
      status: 'active',
      context: {
        departmentIds: [agent.departmentId],
        agentIds: [agent.id],
      },
      provenance: [],
      metadata: { structural: true },
    });

    if (agent.parentId) {
      edges.push({
        id: `reports-to:${agent.id}:${agent.parentId}`,
        source: agent.id,
        target: agent.parentId,
        type: 'reports_to',
        directed: true,
        strength: 1,
        confidence: 1,
        status: 'active',
        context: {
          departmentIds: [agent.departmentId],
          agentIds: [agent.id, agent.parentId],
        },
        provenance: [],
        metadata: { structural: true },
      });
    }
  }

  return BrainGraphSchema.parse({
    schemaVersion: 1,
    graphId: STARTUP_BRAIN_NODE_ID,
    revision: 0,
    generatedAt,
    nodes,
    edges,
    metadata: {
      foundation: true,
      operationalMemoryIncluded: false,
    },
  });
}
