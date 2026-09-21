import {
  inspectBrainGraph,
} from '@/lib/brain/brain-health';

import {
  kHopSubgraph,
  neighbors,
  requireNode,
} from '@/lib/brain/graph-ops';

import {
  retrieveBrainGraph,
} from '@/lib/brain/retrieval';

import {
  BrainGraphEventSchema,
} from '@/lib/brain/events';

import {
  applyReadBudget,
  projectNodeForRead,
} from '@/lib/brain/gateway/budget';

import {
  canCommitMutation,
  canInspectBrainHealth,
  canInspectGraph,
  canProposeMutation,
  canReadNode,
  canUseRetrieval,
} from '@/lib/brain/gateway/policy';

import {
  routeBrainIntent,
} from '@/lib/brain/gateway/routing';

import {
  BrainGatewayPrincipalSchema,
  BrainGraphExploreRequestSchema,
  BrainMutationCommitRequestSchema,
  BrainMutationProposalSchema,
  BrainNodeInspectRequestSchema,
  BrainReadRequestSchema,
  type BrainAuditRecord,
  type BrainGraphExploreRequestInput,
  type BrainMutationCommitRequestInput,
  type BrainMutationProposalInput,
  type BrainNodeInspectRequestInput,
  type BrainReadRequestInput,
} from '@/lib/brain/gateway/schema';

import type {
  BrainAuditStore,
  BrainGraphStore,
} from '@/lib/brain/gateway/store';

function makeAuditId(
  requestId: string,
  suffix: string,
): string {
  return `brain-audit:${requestId}:${suffix}`;
}

export class BrainGateway {
  constructor(
    private readonly graphStore: BrainGraphStore,
    private readonly auditStore: BrainAuditStore,
    private readonly clock: () => string = () =>
      new Date().toISOString(),
  ) {}

  private async audit(
    record: Omit<BrainAuditRecord, 'at'> & { at?: string },
  ): Promise<void> {
    await this.auditStore.append({
      ...record,
      at: record.at ?? this.clock(),
    });
  }

  async read(
    requestInput: BrainReadRequestInput,
  ) {
    const request =
      BrainReadRequestSchema.parse(requestInput);

    const route = routeBrainIntent(request.intent);

    if (!route.brainRequired) {
      await this.audit({
        auditId: makeAuditId(
          request.requestId,
          'external-route',
        ),
        requestId: request.requestId,
        actor: request.principal.actor,
        action: 'brain.read',
        outcome: 'routed_external',
        reason: route.explanation,
        metadata: {
          routes: route.routes,
          intent: route.intent,
        },
      });

      return {
        route,
        results: [],
        truncated: false,
        totalContentChars: 0,
      };
    }

    const permission = canUseRetrieval(
      request.principal,
    );

    if (!permission.allowed) {
      await this.audit({
        auditId: makeAuditId(
          request.requestId,
          'denied',
        ),
        requestId: request.requestId,
        actor: request.principal.actor,
        action: 'brain.read',
        outcome: 'denied',
        reason: permission.reason,
        metadata: {
          intent: request.intent,
        },
      });

      throw new Error(permission.reason);
    }

    const graph =
      await this.graphStore.getSnapshot();

    const retrieval = retrieveBrainGraph(
      graph,
      {
        ...request.query,
        maxHops: Math.min(
          request.query.maxHops,
          request.budget.maxHops,
        ),
        limit: Math.min(
          request.query.limit,
          request.budget.maxResults,
        ),
        nodeTypes:
          request.requestedNodeTypes.length > 0
            ? request.requestedNodeTypes
            : request.query.nodeTypes,
      },
      {
        now: request.query.asOf ?? this.clock(),
      },
    );

    const authorized = retrieval.filter(
      (result) =>
        canReadNode(
          request.principal,
          result.node,
        ).allowed,
    );

    const budgeted = applyReadBudget(
      authorized,
      request.budget,
    );

    await this.audit({
      auditId: makeAuditId(
        request.requestId,
        'allowed',
      ),
      requestId: request.requestId,
      actor: request.principal.actor,
      action: 'brain.read',
      outcome: 'allowed',
      reason: 'brain_retrieval_completed',
      graphRevisionBefore: graph.revision,
      graphRevisionAfter: graph.revision,
      metadata: {
        intent: request.intent,
        returned: budgeted.results.length,
        truncated: budgeted.truncated,
      },
    });

    return {
      route,
      ...budgeted,
    };
  }

  async inspectNode(
    requestInput: BrainNodeInspectRequestInput,
  ) {
    const request =
      BrainNodeInspectRequestSchema.parse(
        requestInput,
      );

    const permission = canInspectGraph(
      request.principal,
    );

    if (!permission.allowed) {
      throw new Error(permission.reason);
    }

    const graph =
      await this.graphStore.getSnapshot();

    const node = requireNode(
      graph,
      request.nodeId,
    );

    const nodeRead =
      canReadNode(request.principal, node);

    if (!nodeRead.allowed) {
      throw new Error(nodeRead.reason);
    }

    const projected = projectNodeForRead(
      node,
      request.budget,
      request.budget.maxTotalContentChars,
    );

    const neighborViews = request.includeNeighbors
      ? neighbors(graph, node.id)
          .filter(
            (candidate) =>
              canReadNode(
                request.principal,
                candidate,
              ).allowed,
          )
          .slice(0, request.neighborLimit)
          .map((candidate) =>
            projectNodeForRead(
              candidate,
              request.budget,
              request.budget.maxContentCharsPerNode,
            ).view,
          )
      : [];

    await this.audit({
      auditId: makeAuditId(
        request.requestId,
        'inspect',
      ),
      requestId: request.requestId,
      actor: request.principal.actor,
      action: 'brain.inspect_node',
      outcome: 'allowed',
      reason: 'node_inspection_completed',
      graphRevisionBefore: graph.revision,
      graphRevisionAfter: graph.revision,
      metadata: {
        nodeId: request.nodeId,
        neighborCount: neighborViews.length,
      },
    });

    return {
      node: projected.view,
      neighbors: neighborViews,
    };
  }

  async exploreGraph(
    requestInput: BrainGraphExploreRequestInput,
  ) {
    const request =
      BrainGraphExploreRequestSchema.parse(
        requestInput,
      );

    const permission = canInspectGraph(
      request.principal,
    );

    if (!permission.allowed) {
      throw new Error(permission.reason);
    }

    const graph =
      await this.graphStore.getSnapshot();

    const rawSubgraph = kHopSubgraph(
      graph,
      request.seedNodeIds,
      request.maxHops,
    );

    const allowedNodeIds = new Set(
      rawSubgraph.nodes
        .filter(
          (node) =>
            canReadNode(
              request.principal,
              node,
            ).allowed,
        )
        .slice(0, request.maxNodes)
        .map((node) => node.id),
    );

    const subgraph = {
      ...rawSubgraph,
      nodes: rawSubgraph.nodes.filter(
        (node) => allowedNodeIds.has(node.id),
      ),
      edges: rawSubgraph.edges.filter(
        (edge) =>
          allowedNodeIds.has(edge.source) &&
          allowedNodeIds.has(edge.target),
      ),
    };

    await this.audit({
      auditId: makeAuditId(
        request.requestId,
        'explore',
      ),
      requestId: request.requestId,
      actor: request.principal.actor,
      action: 'brain.explore_graph',
      outcome: 'allowed',
      reason: 'graph_exploration_completed',
      graphRevisionBefore: graph.revision,
      graphRevisionAfter: graph.revision,
      metadata: {
        nodeCount: subgraph.nodes.length,
        edgeCount: subgraph.edges.length,
      },
    });

    return subgraph;
  }

  async health(input: {
  requestId: string;
  principal: BrainReadRequestInput['principal'];
}) {
  const principal =
    BrainGatewayPrincipalSchema.parse(
      input.principal,
    );

  const permission =
    canInspectBrainHealth(principal);

  if (!permission.allowed) {
    throw new Error(permission.reason);
  }

  const graph =
    await this.graphStore.getSnapshot();

  const report = inspectBrainGraph(
    graph,
    this.clock(),
  );

  await this.audit({
    auditId: makeAuditId(
      input.requestId,
      'health',
    ),
    requestId: input.requestId,
    actor: principal.actor,
    action: 'brain.health',
    outcome: 'allowed',
    reason: 'brain_health_inspection_completed',
    graphRevisionBefore: graph.revision,
    graphRevisionAfter: graph.revision,
    metadata: {
      nodeCount: report.stats.nodeCount,
      edgeCount: report.stats.edgeCount,
    },
  });

  return report;
}

  async proposeMutation(
    proposalInput: BrainMutationProposalInput,
  ) {
    const proposal =
      BrainMutationProposalSchema.parse(
        proposalInput,
      );

    const permission = canProposeMutation(
      proposal.principal,
    );

    if (!permission.allowed) {
      throw new Error(permission.reason);
    }

    for (const event of proposal.events) {
      BrainGraphEventSchema.parse(event);
    }

    const graph =
      await this.graphStore.getSnapshot();

    await this.audit({
      auditId: makeAuditId(
        proposal.requestId,
        'proposal',
      ),
      requestId: proposal.requestId,
      actor: proposal.principal.actor,
      action: 'brain.propose_mutation',
      outcome: 'proposed',
      reason: 'mutation_requires_control_plane_commit',
      graphRevisionBefore: graph.revision,
      graphRevisionAfter: graph.revision,
      metadata: {
        proposalId: proposal.proposalId,
        eventCount: proposal.events.length,
      },
    });

    return {
      proposal,
      status: 'pending_control_plane' as const,
      graphRevision: graph.revision,
    };
  }

  async commitMutation(
    requestInput: BrainMutationCommitRequestInput,
  ) {
    const request =
      BrainMutationCommitRequestSchema.parse(
        requestInput,
      );

    const graph =
      await this.graphStore.getSnapshot();

    const permission = canCommitMutation(
      request.principal,
      graph,
      request.proposal.events,
      request.approval,
    );

    if (!permission.allowed) {
      await this.audit({
        auditId: makeAuditId(
          request.requestId,
          'commit-denied',
        ),
        requestId: request.requestId,
        actor: request.principal.actor,
        action: 'brain.commit_mutation',
        outcome: 'denied',
        reason: permission.reason,
        graphRevisionBefore: graph.revision,
        graphRevisionAfter: graph.revision,
        metadata: {
          proposalId: request.proposal.proposalId,
        },
      });

      throw new Error(permission.reason);
    }

    const committed =
      await this.graphStore.commitEvents({
        events: request.proposal.events,
        expectedRevision:
          request.expectedRevision,
      });

    await this.audit({
      auditId: makeAuditId(
        request.requestId,
        'committed',
      ),
      requestId: request.requestId,
      actor: request.principal.actor,
      action: 'brain.commit_mutation',
      outcome: 'committed',
      reason: 'mutation_committed',
      graphRevisionBefore: graph.revision,
      graphRevisionAfter: committed.revision,
      metadata: {
        proposalId: request.proposal.proposalId,
        eventCount:
          request.proposal.events.length,
      },
    });

    return {
      graphRevisionBefore: graph.revision,
      graphRevisionAfter: committed.revision,
      committedEventCount:
        request.proposal.events.length,
    };
  }
}
