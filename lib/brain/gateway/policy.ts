import type {
  BrainGraph,
  BrainGraphEvent,
  BrainGraphNode,
} from '@/lib/brain';

import {
  type BrainCapability,
  type BrainGatewayPrincipal,
  type BrainMutationApproval,
} from '@/lib/brain/gateway/schema';

export type BrainAuthorizationDecision = {
  allowed: boolean;
  reason: string;
};

function hasCapability(
  principal: BrainGatewayPrincipal,
  capability: BrainCapability,
): boolean {
  return (
    principal.capabilities.includes('brain.admin') ||
    principal.capabilities.includes(capability)
  );
}

function explicitReadScopeAllows(
  principal: BrainGatewayPrincipal,
  node: BrainGraphNode,
): boolean {
  const agentScope = node.governance.readableByAgentIds;
  const departmentScope = node.governance.readableByDepartmentIds;

  if (agentScope.length === 0 && departmentScope.length === 0) {
    return true;
  }

  return (
    agentScope.includes(principal.actor.id) ||
    principal.departmentIds.some((departmentId) =>
      departmentScope.includes(departmentId),
    )
  );
}

export function canReadNode(
  principal: BrainGatewayPrincipal,
  node: BrainGraphNode,
): BrainAuthorizationDecision {
  if (!hasCapability(principal, 'brain.read')) {
    return {
      allowed: false,
      reason: 'principal_missing_brain_read_capability',
    };
  }

  if (!explicitReadScopeAllows(principal, node)) {
    return {
      allowed: false,
      reason: 'node_read_scope_denied',
    };
  }

  if (
    node.governance.visibility === 'confidential' &&
    !hasCapability(principal, 'brain.read_confidential')
  ) {
    return {
      allowed: false,
      reason: 'confidential_memory_requires_capability',
    };
  }

  if (
    node.governance.visibility === 'restricted' &&
    !hasCapability(principal, 'brain.read_restricted')
  ) {
    return {
      allowed: false,
      reason: 'restricted_memory_requires_capability',
    };
  }

  return {
    allowed: true,
    reason: 'read_allowed',
  };
}

export function canUseRetrieval(
  principal: BrainGatewayPrincipal,
): BrainAuthorizationDecision {
  return hasCapability(principal, 'brain.retrieve')
    ? { allowed: true, reason: 'retrieval_allowed' }
    : { allowed: false, reason: 'principal_missing_brain_retrieve_capability' };
}

export function canInspectGraph(
  principal: BrainGatewayPrincipal,
): BrainAuthorizationDecision {
  return hasCapability(principal, 'brain.inspect')
    ? { allowed: true, reason: 'inspection_allowed' }
    : { allowed: false, reason: 'principal_missing_brain_inspect_capability' };
}

export function canInspectBrainHealth(
  principal: BrainGatewayPrincipal,
): BrainAuthorizationDecision {
  return hasCapability(principal, 'brain.health')
    ? { allowed: true, reason: 'health_inspection_allowed' }
    : { allowed: false, reason: 'principal_missing_brain_health_capability' };
}

export function canProposeMutation(
  principal: BrainGatewayPrincipal,
): BrainAuthorizationDecision {
  return hasCapability(principal, 'brain.propose_write')
    ? { allowed: true, reason: 'mutation_proposal_allowed' }
    : { allowed: false, reason: 'principal_missing_brain_propose_write_capability' };
}

function targetNodesForEvent(
  graph: BrainGraph,
  event: BrainGraphEvent,
): BrainGraphNode[] {
  const ids = new Set<string>();

  switch (event.type) {
    case 'node_added':
      return [];

    case 'node_updated':
    case 'node_removed':
    case 'memory_accessed':
    case 'memory_reinforced':
    case 'memory_stage_changed':
      ids.add(event.payload.nodeId);
      break;

    case 'edge_added':
      ids.add(event.payload.edge.source);
      ids.add(event.payload.edge.target);
      break;

    case 'edge_removed': {
      const edge = graph.edges.find((candidate) => candidate.id === event.payload.edgeId);
      if (edge) {
        ids.add(edge.source);
        ids.add(edge.target);
      }
      break;
    }

    case 'node_superseded':
      ids.add(event.payload.nodeId);
      ids.add(event.payload.byNodeId);
      break;
  }

  return graph.nodes.filter((node) => ids.has(node.id));
}

function writeScopeAllows(
  principal: BrainGatewayPrincipal,
  node: BrainGraphNode,
): boolean {
  const agentScope = node.governance.writableByAgentIds;
  const departmentScope = node.governance.writableByDepartmentIds;

  if (agentScope.length === 0 && departmentScope.length === 0) {
    return true;
  }

  return (
    agentScope.includes(principal.actor.id) ||
    principal.departmentIds.some((departmentId) =>
      departmentScope.includes(departmentId),
    )
  );
}

export function canCommitMutation(
  principal: BrainGatewayPrincipal,
  graph: BrainGraph,
  events: BrainGraphEvent[],
  approval?: BrainMutationApproval,
): BrainAuthorizationDecision {
  if (!hasCapability(principal, 'brain.commit_write')) {
    return {
      allowed: false,
      reason: 'principal_missing_brain_commit_write_capability',
    };
  }

  if (principal.actor.kind === 'agent') {
    return {
      allowed: false,
      reason: 'agents_may_propose_but_never_commit_brain_mutations',
    };
  }

  for (const event of events) {
    const targets = targetNodesForEvent(graph, event);

    for (const node of targets) {
      if (
        node.governance.immutable &&
        event.type !== 'memory_accessed' &&
        event.type !== 'memory_reinforced'
      ) {
        return {
          allowed: false,
          reason: `immutable_node_mutation_denied:${node.id}`,
        };
      }

      if (!writeScopeAllows(principal, node)) {
        return {
          allowed: false,
          reason: `node_write_scope_denied:${node.id}`,
        };
      }

      if (node.governance.humanApprovalRequired) {
        if (!approval || approval.approvedBy.kind !== 'human') {
          return {
            allowed: false,
            reason: `human_approval_required:${node.id}`,
          };
        }
      }
    }
  }

  return {
    allowed: true,
    reason: 'mutation_commit_allowed',
  };
}
