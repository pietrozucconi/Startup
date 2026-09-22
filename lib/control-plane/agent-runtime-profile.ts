import { z } from 'zod';

export const AgentToolCapabilitySchema = z.enum([
  'web-research',
  'macro-data',
  'market-data',
  'news',
  'financial-statements',
  'company-filings',
  'crypto-data',
  'etf-data',
  'portfolio-data',
  'event-calendar',
  'instrument-reference',
  'performance-data',
  'agent-logs',
  'proposal-registry',
  'trade-ticket-registry',
]);

export const AgentRuntimeBudgetSchema = z.object({
  maxToolCalls: z.number().int().min(0).max(100).default(12),
  maxInputTokens: z.number().int().positive().max(1_000_000).default(32_000),
  maxOutputTokens: z.number().int().positive().max(200_000).default(8_000),
  maxOutputChars: z.number().int().positive().max(2_000_000).default(100_000),
  timeoutMs: z.number().int().positive().max(30 * 60 * 1000).default(120_000),
});

export const AgentBrainAccessSchema = z.object({
  enabled: z.boolean().default(true),
  maxResults: z.number().int().positive().max(50).default(12),
  maxHops: z.number().int().min(0).max(6).default(3),
  maxContentCharsPerNode: z.number().int().min(0).max(25_000).default(4_000),
  maxTotalContentChars: z.number().int().min(0).max(200_000).default(30_000),
});

export const CompanyAgentRuntimeProfileSchema = z.object({
  agentId: z.string().min(1),
  departmentId: z.enum([
    'dept-research',
    'dept-risk',
    'dept-monitoring',
  ]),
  role: z.string().min(1),
  mission: z.string().min(1),

  /**
   * Only read-capability families are expressible here.
   * There is intentionally no broker/order/execution capability.
   */
  allowedToolCapabilities: z.array(AgentToolCapabilitySchema).default([]),

  brain: AgentBrainAccessSchema.default({}),
  budget: AgentRuntimeBudgetSchema.default({}),
});

export type AgentToolCapability = z.infer<
  typeof AgentToolCapabilitySchema
>;

export type CompanyAgentRuntimeProfile = z.infer<
  typeof CompanyAgentRuntimeProfileSchema
>;

const COMMON = ['web-research'] as const;

function profile(
  input: z.input<typeof CompanyAgentRuntimeProfileSchema>,
): CompanyAgentRuntimeProfile {
  return CompanyAgentRuntimeProfileSchema.parse(input);
}

/**
 * Runtime security profiles.
 *
 * These are execution-time allowlists, not proof that a connection exists.
 * A tool must also be registered by trusted infrastructure before it can be
 * invoked.
 */
const COMPANY_AGENT_RUNTIME_PROFILES: Record<
  string,
  CompanyAgentRuntimeProfile
> = {
  djed: profile({
    agentId: 'djed',
    departmentId: 'dept-research',
    role: 'Macro & Geopolitical Desk',
    mission:
      'Maintain the global macroeconomic and geopolitical view and provide evidence relevant to investment research.',
    allowedToolCapabilities: [
      ...COMMON,
      'macro-data',
      'market-data',
      'news',
    ],
  }),

  marcus: profile({
    agentId: 'marcus',
    departmentId: 'dept-research',
    role: 'Market News Desk',
    mission:
      'Monitor company, sector and market news, regulation, M&A, catalysts and other material events.',
    allowedToolCapabilities: [
      ...COMMON,
      'news',
      'market-data',
    ],
  }),

  lauti: profile({
    agentId: 'lauti',
    departmentId: 'dept-research',
    role: 'Equity Research Desk',
    mission:
      'Research listed equities and produce governed investment proposals when evidence and conviction are sufficient.',
    allowedToolCapabilities: [
      ...COMMON,
      'market-data',
      'financial-statements',
      'company-filings',
    ],
  }),

  pepo: profile({
    agentId: 'pepo',
    departmentId: 'dept-research',
    role: 'Crypto Research Desk',
    mission:
      'Research cryptocurrencies and digital assets using market, protocol, tokenomic, liquidity, adoption, regulatory and security evidence.',
    allowedToolCapabilities: [
      ...COMMON,
      'market-data',
      'crypto-data',
      'news',
    ],
  }),

  andy: profile({
    agentId: 'andy',
    departmentId: 'dept-research',
    role: 'ETF Research Desk',
    mission:
      'Research ETFs through methodology, holdings, exposures, costs, tracking quality, concentration, liquidity and structure.',
    allowedToolCapabilities: [
      ...COMMON,
      'market-data',
      'etf-data',
    ],
  }),

  yann: profile({
    agentId: 'yann',
    departmentId: 'dept-research',
    role: 'Red Desk',
    mission:
      'Independently challenge investment proposals, search for contradictory evidence and expose material weaknesses or overlooked risks.',
    allowedToolCapabilities: [
      ...COMMON,
      'market-data',
      'news',
    ],
  }),

  beppe: profile({
    agentId: 'beppe',
    departmentId: 'dept-research',
    role: 'Final Research Supervisor',
    mission:
      'Integrate research work, enforce research standards and prepare the final governed research brief for the CEO.',
    allowedToolCapabilities: [
      ...COMMON,
      'proposal-registry',
    ],
  }),

  manuel: profile({
    agentId: 'manuel',
    departmentId: 'dept-risk',
    role: 'Portfolio Risk Manager',
    mission:
      'Evaluate portfolio sustainability, concentration, diversification, correlation, liquidity, drawdown implications and responsible capital allocation.',
    allowedToolCapabilities: [
      ...COMMON,
      'portfolio-data',
      'market-data',
    ],
  }),

  dimash: profile({
    agentId: 'dimash',
    departmentId: 'dept-risk',
    role: 'Trade Structuring Analyst',
    mission:
      'Transform an approved investment idea into a proposed structure covering entry, sizing, stop, targets, duration, invalidation and risk-reward.',
    allowedToolCapabilities: [
      ...COMMON,
      'market-data',
      'portfolio-data',
    ],
  }),

  bare: profile({
    agentId: 'bare',
    departmentId: 'dept-risk',
    role: 'Liquidity & Event Risk Analyst',
    mission:
      'Evaluate liquidity, expected execution quality, volatility and material event risk before an operation may proceed.',
    allowedToolCapabilities: [
      ...COMMON,
      'market-data',
      'event-calendar',
      'news',
    ],
  }),

  angelo: profile({
    agentId: 'angelo',
    departmentId: 'dept-risk',
    role: 'Broker Execution Specialist',
    mission:
      'Prepare broker-neutral manual execution instructions for the CEO without receiving authority or tooling to execute financial transactions.',
    allowedToolCapabilities: [
      ...COMMON,
      'instrument-reference',
      'market-data',
    ],
  }),

  pio: profile({
    agentId: 'pio',
    departmentId: 'dept-risk',
    role: 'Independent Risk Controller',
    mission:
      'Independently review calculations, assumptions, sources, constraints, liquidity, event risks and trade structure.',
    allowedToolCapabilities: [
      ...COMMON,
      'market-data',
      'portfolio-data',
      'event-calendar',
    ],
  }),

  christian: profile({
    agentId: 'christian',
    departmentId: 'dept-risk',
    role: 'Final Risk Supervisor',
    mission:
      'Integrate risk work, enforce risk governance and prepare the definitive risk ticket for the CEO.',
    allowedToolCapabilities: [
      ...COMMON,
      'trade-ticket-registry',
      'portfolio-data',
    ],
  }),

  john: profile({
    agentId: 'john',
    departmentId: 'dept-monitoring',
    role: 'Position Monitoring Desk',
    mission:
      'Monitor open positions against market conditions, material news, thesis validity, invalidation criteria and the approved trade ticket.',
    allowedToolCapabilities: [
      ...COMMON,
      'market-data',
      'portfolio-data',
      'news',
    ],
  }),

  ale: profile({
    agentId: 'ale',
    departmentId: 'dept-monitoring',
    role: 'Portfolio Exposure & Event Watch',
    mission:
      'Monitor exposure, concentration, correlation, diversification, drawdown, liquidity and material portfolio events.',
    allowedToolCapabilities: [
      ...COMMON,
      'portfolio-data',
      'market-data',
      'event-calendar',
      'news',
    ],
  }),

  carlos: profile({
    agentId: 'carlos',
    departmentId: 'dept-monitoring',
    role: 'Performance Analytics Desk',
    mission:
      'Measure proposal, trade and portfolio outcomes against expectations, benchmarks, risk and execution costs.',
    allowedToolCapabilities: [
      ...COMMON,
      'portfolio-data',
      'performance-data',
      'market-data',
    ],
  }),

  hakan: profile({
    agentId: 'hakan',
    departmentId: 'dept-monitoring',
    role: 'Employee KPI & Audit Desk',
    mission:
      'Evaluate employees using role-specific process, quality, compliance, source, timeliness, error and collaboration evidence.',
    allowedToolCapabilities: [
      ...COMMON,
      'agent-logs',
      'performance-data',
    ],
  }),

  zielu: profile({
    agentId: 'zielu',
    departmentId: 'dept-monitoring',
    role: 'Learning & Process Improvement Desk',
    mission:
      'Conduct post-mortems, identify recurring evidence-backed patterns and propose tested, versioned process improvements.',
    allowedToolCapabilities: [
      ...COMMON,
      'agent-logs',
      'performance-data',
    ],
  }),

  javier: profile({
    agentId: 'javier',
    departmentId: 'dept-monitoring',
    role: 'Final Monitoring Supervisor',
    mission:
      'Integrate monitoring, performance, KPI and learning work and act as the monitoring team interface with the CEO.',
    allowedToolCapabilities: [
      ...COMMON,
      'portfolio-data',
      'agent-logs',
      'performance-data',
    ],
  }),
};

export const COMPANY_AGENT_IDS = Object.freeze(
  Object.keys(COMPANY_AGENT_RUNTIME_PROFILES),
);

export function getCompanyAgentRuntimeProfile(
  agentId: string,
): CompanyAgentRuntimeProfile {
  const profile =
    COMPANY_AGENT_RUNTIME_PROFILES[agentId];

  if (!profile) {
    throw new Error(
      `company_agent_runtime_profile_not_found:${agentId}`,
    );
  }

  return structuredClone(profile);
}

export function listCompanyAgentRuntimeProfiles():
  CompanyAgentRuntimeProfile[] {
  return COMPANY_AGENT_IDS.map(
    getCompanyAgentRuntimeProfile,
  );
}
