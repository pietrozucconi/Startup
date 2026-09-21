import {
  BrainRouteDecisionSchema,
  type BrainInformationIntent,
  type BrainRouteDecision,
} from '@/lib/brain/gateway/schema';

const ROUTES: Record<BrainInformationIntent, BrainRouteDecision> = {
  institutional_memory: {
    intent: 'institutional_memory',
    routes: ['brain'],
    brainRequired: true,
    explanation: 'Institutional memory belongs to Startup Brain.',
  },

  prior_reasoning: {
    intent: 'prior_reasoning',
    routes: ['brain'],
    brainRequired: true,
    explanation: 'Prior company reasoning must be retrieved from Startup Brain.',
  },

  prior_decisions: {
    intent: 'prior_decisions',
    routes: ['brain'],
    brainRequired: true,
    explanation: 'Prior decisions are institutional records.',
  },

  past_experiences: {
    intent: 'past_experiences',
    routes: ['brain'],
    brainRequired: true,
    explanation: 'Past company experiences belong to institutional memory.',
  },

  validated_lessons: {
    intent: 'validated_lessons',
    routes: ['brain'],
    brainRequired: true,
    explanation: 'Validated lessons are consolidated Startup Brain memory.',
  },

  policies_and_sops: {
    intent: 'policies_and_sops',
    routes: ['brain', 'control_plane'],
    brainRequired: true,
    explanation:
      'Startup Brain provides institutional knowledge; Control Plane remains authoritative for executable policy.',
  },

  graph_exploration: {
    intent: 'graph_exploration',
    routes: ['brain'],
    brainRequired: true,
    explanation: 'Knowledge-graph exploration is a Startup Brain function.',
  },

  brain_health: {
    intent: 'brain_health',
    routes: ['brain'],
    brainRequired: true,
    explanation: 'Brain-health inspection operates on the institutional graph.',
  },

  current_market_price: {
    intent: 'current_market_price',
    routes: ['market_data'],
    brainRequired: false,
    explanation:
      'Current prices must come from an external market-data provider, not institutional memory.',
  },

  historical_market_data: {
    intent: 'historical_market_data',
    routes: ['market_data'],
    brainRequired: false,
    explanation:
      'Raw historical price series belong in market-data infrastructure, not Startup Brain.',
  },

  latest_company_filing: {
    intent: 'latest_company_filing',
    routes: ['filings'],
    brainRequired: false,
    explanation:
      'Latest filings must be fetched from an authoritative external source.',
  },

  latest_news: {
    intent: 'latest_news',
    routes: ['web'],
    brainRequired: false,
    explanation:
      'Latest news is current external information and must be fetched externally.',
  },

  web_research: {
    intent: 'web_research',
    routes: ['web'],
    brainRequired: false,
    explanation:
      'Open-web research is external evidence and is not replaced by Startup Brain.',
  },

  live_portfolio_state: {
    intent: 'live_portfolio_state',
    routes: ['portfolio'],
    brainRequired: false,
    explanation:
      'Live portfolio state must come from the operational portfolio data source.',
  },

  execution_request: {
    intent: 'execution_request',
    routes: ['control_plane'],
    brainRequired: false,
    explanation:
      'Execution authority belongs to the governed Control Plane and human CEO, never Startup Brain.',
  },

  mixed_brain_and_current_context: {
    intent: 'mixed_brain_and_current_context',
    routes: ['brain', 'market_data', 'filings', 'web', 'portfolio'],
    brainRequired: true,
    explanation:
      'The task needs institutional memory combined with current external context.',
  },
};

export function routeBrainIntent(
  intent: BrainInformationIntent,
): BrainRouteDecision {
  return BrainRouteDecisionSchema.parse(ROUTES[intent]);
}
