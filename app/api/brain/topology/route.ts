import { NextResponse } from 'next/server';

import { getDb } from '@/lib/data';
import {
  getCompanyAgentRuntimeProfile,
} from '@/lib/control-plane/agent-runtime-profile';

export const dynamic = 'force-dynamic';

export function GET() {
  const db = getDb();

  const departments = [...db.departments.all()].sort(
    (a, b) => a.order - b.order,
  );

  const agents = [...db.agents.all()].sort(
    (a, b) => a.name.localeCompare(b.name),
  );

  const departmentsById = new Map(
    departments.map((department) => [department.id, department]),
  );

  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),

      systems: {
        memory: {
          id: 'startup-memory',
          label: 'Startup Memory',
          purpose:
            'Canonical company knowledge: identity, organization, governance, policies, agent instructions, runtime profiles, models and approved procedures.',
        },
        brain: {
          id: 'startup-brain',
          label: 'Startup Brain',
          purpose:
            'Experiential company knowledge that grows from real reasoning, decisions, outcomes, errors, reviews and validated learning.',
        },
      },

      retrieval: {
        gateway: 'Brain Gateway',
        fullDumpAllowed: false,
        modes: [
          'keyword_similarity',
          'semantic_similarity',
          'contextual_similarity',
          'graph_relationships',
        ],
      },

      departments: departments.map((department) => ({
        id: department.id,
        name: department.name,
        order: department.order,
      })),

      agents: agents.map((agent) => {
        const profile = getCompanyAgentRuntimeProfile(agent.id);
        const department = departmentsById.get(agent.departmentId);

        return {
          id: agent.id,
          name: agent.name,
          role: agent.role,
          departmentId: agent.departmentId,
          departmentName: department?.name ?? agent.departmentId,
          tier: agent.tier,
          status: agent.status,
          model: agent.model,
          brainAccess: profile.brain.enabled,
          retrievalAccess: {
            startupMemory: true,
            startupBrain: profile.brain.enabled,
            gatewayEnforced: true,
            fullMemoryDumpAllowed: false,
            fullBrainDumpAllowed: false,
          },
        };
      }),

      /*
       * The renderer is intentionally graph-native from this checkpoint.
       * Today the experiential graph is empty, so no synthetic memories are
       * fabricated. In the next Brain milestone this array will be populated
       * from the governed persistent Brain store. The 3D renderer will then
       * expand automatically as real nodes and edges appear.
       */
      brainGraph: {
        nodes: [],
        edges: [],
      },

      operationalMemory: {
        experiences: 0,
        decisions: 0,
        validatedLessons: 0,
      },
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}
