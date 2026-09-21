import { z } from 'zod';

export const AgentStatusSchema = z.enum(['active', 'idle', 'training', 'planned']);
export const AgentTierSchema = z.enum(['lead', 'specialist', 'worker']);
export const ToolStatusSchema = z.enum(['connected', 'available', 'planned']);

export const DepartmentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  slug: z.string().min(1),
  tagline: z.string(),
  color: z.string().min(1),
  order: z.number().int(),
});

export const AgentSchema = z.object({
  id: z.string().min(1),
  departmentId: z.string().min(1),
  name: z.string().min(1),
  role: z.string(),
  status: AgentStatusSchema,
  tier: AgentTierSchema,
  description: z.string(),
  model: z.string(),
  tools: z.array(z.string()),
  // parentId nests sub-agents under the agent doing the delegating;
  // instance names the runtime that will host this agent ('builtin' today,
  // an OpenClaw/Claude Code instance name once the dedicated host is live).
  parentId: z.string().nullable().default(null),
  instance: z.string().min(1).default('builtin'),
});

export const ToolSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1),
  status: ToolStatusSchema,
  color: z.string().min(1),
  description: z.string(),
});

// Integration = one entry in the connections marketplace: a brand, a one-line
// blurb, a category, and an optional link to a real connector that drives its
// live "connected" state. Logo comes from `slug` via lib/brand-logos.
export const INTEGRATION_CATEGORIES = [
  'Productivity',
  'Communication',
  'Developer',
  'Scheduling',
  'Finance',
  'Storage',
  'AI & Automation',
  'Creative',
] as const;
export const IntegrationCategorySchema = z.enum(INTEGRATION_CATEGORIES);
export const IntegrationSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  tagline: z.string().min(1),
  category: IntegrationCategorySchema,
  // when set, the catalog entry reflects this real connector's live state
  connectorId: z.string().min(1).optional(),
  popular: z.boolean().optional(),
  // env var names the connect flow may write to .env.local for this entry.
  // Omitted = a generic <SLUG>_API_KEY; [] = not key-connectable (guidance only).
  envKeys: z.array(z.string().regex(/^[A-Z][A-Z0-9_]*$/)).optional(),
});
export type Integration = z.infer<typeof IntegrationSchema>;
export type IntegrationCategory = z.infer<typeof IntegrationCategorySchema>;



export const AgentRunSchema = z.object({
  id: z.string().min(1),
  agentId: z.string().min(1),
  startedAt: z.string().min(1),
  finishedAt: z.string().min(1),
  ok: z.boolean(),
  summary: z.string(),
});

export const BroadcastReplySchema = z.object({
  id: z.string().min(1),
  broadcastId: z.string().min(1),
  agentId: z.string().min(1),
  ok: z.boolean(),
  reply: z.string(),
  finishedAt: z.string().min(1),
});

export const BroadcastSchema = z.object({
  id: z.string().min(1),
  message: z.string().min(1),
  createdAt: z.string().min(1),
  replies: z.array(BroadcastReplySchema),
});

export const AgentMessageRoleSchema = z.enum(['user', 'assistant', 'tool']);

export const AgentToolCallSchema = z.object({
  name: z.string().min(1),
  args: z.unknown(),
  result: z.unknown(),
});

export const AgentMessageSchema = z.object({
  id: z.string().min(1),
  agentId: z.string().min(1),
  role: AgentMessageRoleSchema,
  content: z.string(),
  toolCalls: z.array(AgentToolCallSchema).default([]),
  createdAt: z.string().min(1),
});

export const ActivityEventSchema = z.object({
  kind: z.enum(['run', 'message', 'broadcast']),
  agentId: z.string().min(1),
  at: z.string().min(1),
  summary: z.string(),
  ok: z.boolean().optional(),
});


export const AgentTaskSchema = z.object({
  id: z.string().min(1),
  agentId: z.string().min(1),
  title: z.string().min(1),
  status: z.enum(['open', 'doing', 'done']),
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});

export const AgentCronSchema = z.object({
  id: z.string().min(1),
  agentId: z.string().min(1),
  schedule: z.string().min(1), // 5-field cron, validated at the repo boundary
  description: z.string().min(1),
  enabled: z.boolean(),
  createdAt: z.string().min(1),
});



// ── Skills — the agent workforce's capability library ───────────────────────
export const SkillStatusSchema = z.enum(['live', 'learning', 'planned']);
export const SkillSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  category: z.string().min(1), // "Sales", "Content", "Ops"…
  description: z.string(),
  ownerAgentId: z.string().nullable(), // the agent that primarily wields it
  status: SkillStatusSchema,
  tools: z.array(z.string()),
  markdown: z.string(), // the skill's SKILL.md doc, viewable from the card
  order: z.number().int(),
});





export type Department = z.infer<typeof DepartmentSchema>;
export type Agent = z.infer<typeof AgentSchema>;
export type AgentStatus = z.infer<typeof AgentStatusSchema>;
export type Tool = z.infer<typeof ToolSchema>;
export type AgentTier = z.infer<typeof AgentTierSchema>;
export type Broadcast = z.infer<typeof BroadcastSchema>;
export type BroadcastReply = z.infer<typeof BroadcastReplySchema>;
export type AgentRun = z.infer<typeof AgentRunSchema>;
export type AgentMessage = z.infer<typeof AgentMessageSchema>;
export type AgentToolCall = z.infer<typeof AgentToolCallSchema>;
export type AgentMessageRole = z.infer<typeof AgentMessageRoleSchema>;
export type ActivityEvent = z.infer<typeof ActivityEventSchema>;
export type AgentTask = z.infer<typeof AgentTaskSchema>;
export type AgentCron = z.infer<typeof AgentCronSchema>;
export type SkillStatus = z.infer<typeof SkillStatusSchema>;
export type Skill = z.infer<typeof SkillSchema>;
