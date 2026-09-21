import type {
  BrainGraphNode,
} from '@/lib/brain/graph-schema';

import type {
  CognitivePolicy,
  MemoryStage,
} from '@/lib/brain/memory-schema';

const ALLOWED_TRANSITIONS: Record<MemoryStage, readonly MemoryStage[]> = {
  structural: ['structural', 'archived'],
  working: ['working', 'interpreted_experience', 'archived'],
  raw_experience: ['raw_experience', 'interpreted_experience', 'archived'],
  interpreted_experience: [
    'interpreted_experience',
    'lesson_candidate',
    'archived',
  ],
  lesson_candidate: [
    'lesson_candidate',
    'validated_lesson',
    'archived',
  ],
  validated_lesson: [
    'validated_lesson',
    'consolidated',
    'superseded',
    'archived',
  ],
  consolidated: [
    'consolidated',
    'superseded',
    'archived',
  ],
  superseded: ['superseded', 'archived'],
  archived: ['archived'],
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function parseTime(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid timestamp: ${value}`);
  }
  return parsed;
}

export function compositeSalience(
  node: BrainGraphNode,
): number {
  const salience = node.memory?.salience;
  if (!salience) return 0;

  const dimensions = [
    salience.novelty,
    salience.surprise,
    salience.materiality,
    salience.urgency,
    salience.riskImpact,
    salience.expectedUtility,
  ];

  return dimensions.reduce((sum, value) => sum + value, 0) /
    dimensions.length;
}

export function decayedRetention(
  node: BrainGraphNode,
  now: string,
): number {
  const memory = node.memory;
  if (!memory) return 1;

  if (
    memory.retentionLock ||
    !memory.decayHalfLifeHours ||
    !memory.lastReinforcedAt
  ) {
    return memory.retentionStrength;
  }

  const elapsedHours = Math.max(
    0,
    (parseTime(now) - parseTime(memory.lastReinforcedAt)) /
      (1000 * 60 * 60),
  );

  const decayFactor = Math.pow(
    0.5,
    elapsedHours / memory.decayHalfLifeHours,
  );

  return clamp01(memory.retentionStrength * decayFactor);
}

export function touchMemoryNode(
  node: BrainGraphNode,
  at: string,
  activationBoost = 0.25,
): BrainGraphNode {
  if (!node.memory) return node;

  const activation = clamp01(
    node.memory.activation +
      activationBoost * (1 - node.memory.activation),
  );

  return {
    ...node,
    memory: {
      ...node.memory,
      activation,
      accessCount: node.memory.accessCount + 1,
      lastAccessedAt: at,
    },
  };
}

export function reinforceMemoryNode(
  node: BrainGraphNode,
  at: string,
  amount = 0.1,
): BrainGraphNode {
  if (!node.memory) return node;

  return {
    ...node,
    memory: {
      ...node.memory,
      retentionStrength: clamp01(
        node.memory.retentionStrength + amount,
      ),
      rehearsalCount: node.memory.rehearsalCount + 1,
      lastReinforcedAt: at,
    },
  };
}

export function transitionMemoryStage(
  node: BrainGraphNode,
  targetStage: MemoryStage,
): BrainGraphNode {
  if (!node.memory) {
    throw new Error(`Node ${node.id} does not carry a memory trace`);
  }

  const current = node.memory.stage;

  if (!ALLOWED_TRANSITIONS[current].includes(targetStage)) {
    throw new Error(
      `Invalid memory transition for ${node.id}: ${current} -> ${targetStage}`,
    );
  }

  return {
    ...node,
    memory: {
      ...node.memory,
      stage: targetStage,
    },
  };
}

export type ConsolidationEvidence = {
  observations: number;
  independentSources: number;
  outcomeEvaluations: number;
  confidence: number;
};

export type ConsolidationAssessment = {
  ready: boolean;
  reasons: string[];
};

export function assessConsolidationCandidate(
  node: BrainGraphNode,
  policy: CognitivePolicy,
  evidence: ConsolidationEvidence,
): ConsolidationAssessment {
  const reasons: string[] = [];

  if (!node.memory) {
    reasons.push('node_has_no_memory_trace');
  } else if (node.memory.stage !== 'lesson_candidate') {
    reasons.push('node_is_not_a_lesson_candidate');
  }

  if (
    evidence.observations <
    policy.consolidation.minimumObservations
  ) {
    reasons.push('insufficient_observations');
  }

  if (
    evidence.independentSources <
    policy.consolidation.minimumIndependentSources
  ) {
    reasons.push('insufficient_independent_sources');
  }

  if (
    evidence.outcomeEvaluations <
    policy.consolidation.minimumOutcomeEvaluations
  ) {
    reasons.push('insufficient_outcome_evaluations');
  }

  if (
    evidence.confidence <
    policy.consolidation.minimumConfidence
  ) {
    reasons.push('confidence_below_policy_threshold');
  }

  return {
    ready: reasons.length === 0,
    reasons,
  };
}
