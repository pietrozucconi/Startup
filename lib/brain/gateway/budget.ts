import type {
  BrainGraphNode,
} from '@/lib/brain/graph-schema';

import type {
  BrainRetrievalResult,
} from '@/lib/brain/retrieval';

import type {
  BrainReadBudget,
} from '@/lib/brain/gateway/schema';

export type BrainNodeView = {
  id: string;
  type: BrainGraphNode['type'];
  label: string;
  summary: string;
  content?: string;
  rationaleSummary: string;
  status: BrainGraphNode['status'];
  tags: string[];
  keywords: string[];
  context: BrainGraphNode['context'];
  epistemic?: BrainGraphNode['epistemic'];
  memory?: BrainGraphNode['memory'];
  metadata?: BrainGraphNode['metadata'];
  version: number;
};

export type BudgetedRetrievalResult = Omit<
  BrainRetrievalResult,
  'node'
> & {
  node: BrainNodeView;
};

function clip(
  value: string,
  maxChars: number,
): string {
  if (maxChars <= 0) {
    return '';
  }

  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, Math.max(0, maxChars - 1))}…`;
}

export function projectNodeForRead(
  node: BrainGraphNode,
  budget: BrainReadBudget,
  remainingTotalChars: number,
): {
  view: BrainNodeView;
  consumedChars: number;
} {
  const allowedChars = Math.min(
    budget.maxContentCharsPerNode,
    Math.max(0, remainingTotalChars),
  );

  const content = budget.includeContent
    ? clip(node.content, allowedChars)
    : '';

  const view: BrainNodeView = {
    id: node.id,
    type: node.type,
    label: node.label,
    summary: node.summary,
    rationaleSummary: node.rationaleSummary,
    status: node.status,
    tags: node.tags,
    keywords: node.keywords,
    context: node.context,
    epistemic: node.epistemic,
    memory: node.memory,
    version: node.version,
  };

  if (budget.includeContent) {
    view.content = content;
  }

  if (budget.includeMetadata) {
    view.metadata = node.metadata;
  }

  return {
    view,
    consumedChars: content.length,
  };
}

export function applyReadBudget(
  results: BrainRetrievalResult[],
  budget: BrainReadBudget,
): {
  results: BudgetedRetrievalResult[];
  truncated: boolean;
  totalContentChars: number;
} {
  const selected = results.slice(0, budget.maxResults);

  let remaining = budget.maxTotalContentChars;
  let totalContentChars = 0;

  const budgeted: BudgetedRetrievalResult[] = [];

  for (const result of selected) {
    const projected = projectNodeForRead(
      result.node,
      budget,
      remaining,
    );

    remaining -= projected.consumedChars;
    totalContentChars += projected.consumedChars;

    budgeted.push({
      ...result,
      node: projected.view,
    });
  }

  return {
    results: budgeted,
    truncated:
      results.length > selected.length ||
      totalContentChars >= budget.maxTotalContentChars,
    totalContentChars,
  };
}
