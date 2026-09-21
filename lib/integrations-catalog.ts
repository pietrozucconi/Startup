import type { ConnectorStatus } from '@/lib/connectors/types';
import {
  INTEGRATION_CATEGORIES,
  type Integration,
  type IntegrationCategory,
} from '@/lib/schemas';

/**
 * Connections marketplace catalog.
 * `connectorId` ties an entry to a real connector so live connection state
 * is never fabricated. Entries without a connector remain available/planned
 * until a real integration is implemented.
 */
export const INTEGRATIONS: Integration[] = [
  // Communication
  { slug: 'slack', name: 'Slack', tagline: 'Channels & DMs', category: 'Communication', connectorId: 'slack', popular: true, envKeys: ['SLACK_BOT_TOKEN'] },
  { slug: 'gmail', name: 'Gmail', tagline: 'Send & read email', category: 'Communication', connectorId: 'email', popular: true, envKeys: [] },
  { slug: 'discord', name: 'Discord', tagline: 'Servers & channels', category: 'Communication' },
  { slug: 'telegram', name: 'Telegram', tagline: 'Chats & bots', category: 'Communication' },
  { slug: 'zoom', name: 'Zoom', tagline: 'Meetings & recordings', category: 'Communication', popular: true },

  // Productivity
  { slug: 'notion', name: 'Notion', tagline: 'Docs & databases', category: 'Productivity', connectorId: 'notion', popular: true, envKeys: ['NOTION_API_KEY'] },
  { slug: 'airtable', name: 'Airtable', tagline: 'Bases & records', category: 'Productivity', popular: true },
  { slug: 'googlesheets', name: 'Google Sheets', tagline: 'Read & write spreadsheets', category: 'Productivity' },
  { slug: 'googledocs', name: 'Google Docs', tagline: 'Create & edit documents', category: 'Productivity' },
  { slug: 'clickup', name: 'ClickUp', tagline: 'Docs, tasks & goals', category: 'Productivity' },
  { slug: 'trello', name: 'Trello', tagline: 'Boards & cards', category: 'Productivity' },
  { slug: 'coda', name: 'Coda', tagline: 'Docs that act like apps', category: 'Productivity' },

  // Developer
  { slug: 'github', name: 'GitHub', tagline: 'Repos, issues & PRs', category: 'Developer', popular: true },
  { slug: 'linear', name: 'Linear', tagline: 'Issues & projects', category: 'Developer' },
  { slug: 'jira', name: 'Jira', tagline: 'Boards & tickets', category: 'Developer' },
  { slug: 'vercel', name: 'Vercel', tagline: 'Deploys & logs', category: 'Developer' },
  { slug: 'sentry', name: 'Sentry', tagline: 'Errors & traces', category: 'Developer' },
  { slug: 'gitlab', name: 'GitLab', tagline: 'Repos & pipelines', category: 'Developer' },

  // Scheduling
  { slug: 'googlecalendar', name: 'Google Calendar', tagline: 'Events & availability', category: 'Scheduling', connectorId: 'calendar', popular: true, envKeys: [] },
  { slug: 'calendly', name: 'Calendly', tagline: 'Booking links', category: 'Scheduling' },
  { slug: 'caldotcom', name: 'Cal.com', tagline: 'Open scheduling', category: 'Scheduling' },
  { slug: 'googlemeet', name: 'Google Meet', tagline: 'Video calls', category: 'Scheduling' },

  // Finance
  
  // Storage
  { slug: 'googledrive', name: 'Google Drive', tagline: 'Files & folders', category: 'Storage' },
  { slug: 'dropbox', name: 'Dropbox', tagline: 'Sync & share', category: 'Storage' },
  { slug: 'box', name: 'Box', tagline: 'Content cloud', category: 'Storage' },
  { slug: 'onedrive', name: 'OneDrive', tagline: 'Microsoft files', category: 'Storage' },

  // AI & Automation
  { slug: 'openai', name: 'OpenAI', tagline: 'GPT models & embeddings', category: 'AI & Automation' },
  { slug: 'anthropic', name: 'Anthropic', tagline: 'Claude models', category: 'AI & Automation', popular: true },
  { slug: 'zapier', name: 'Zapier', tagline: 'Automate anything', category: 'AI & Automation' },
  { slug: 'make', name: 'Make', tagline: 'Visual workflows', category: 'AI & Automation' },
  { slug: 'n8n', name: 'n8n', tagline: 'Self-hosted automation', category: 'AI & Automation' },

  // Creative
  { slug: 'figma', name: 'Figma', tagline: 'Design & prototypes', category: 'Creative', popular: true },
  { slug: 'canva', name: 'Canva', tagline: 'Templates & graphics', category: 'Creative' },
  { slug: 'miro', name: 'Miro', tagline: 'Whiteboards & maps', category: 'Creative', connectorId: 'miro', envKeys: ['MIRO_ACCESS_TOKEN'] },
  { slug: 'loom', name: 'Loom', tagline: 'Screen recordings', category: 'Creative' },
  { slug: 'typeform', name: 'Typeform', tagline: 'Forms & surveys', category: 'Creative' },
];

export type CatalogEntry = Integration & { connected: boolean; keySaved: boolean };

/** The env var names the connect flow may write for an entry. Explicit
 *  envKeys win; no envKeys = a generic <SLUG>_API_KEY; [] = guidance only
 *  (the tool connects through something other than a pasted key). */
export function connectKeysFor(entry: Integration): string[] {
  if (entry.envKeys) return entry.envKeys;
  return [`${entry.slug.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_API_KEY`];
}

/** Merge live connector state onto the catalog. `connected` is true only when a
 *  linked connector actually reports 'connected' — never faked. `keySaved`
 *  means every connect-flow key for the entry sits in .env.local (pass a fresh
 *  readEnvLocal()); a saved key on a connector-less tile shows as stored, not
 *  connected. */
export function connectionCatalog(
  statuses: ConnectorStatus[],
  savedEnv: Record<string, string> = {},
): CatalogEntry[] {
  const byId = new Map(statuses.map((s) => [s.id, s]));
  return INTEGRATIONS.map((i) => {
    const keys = connectKeysFor(i);
    return {
      ...i,
      connected: i.connectorId ? byId.get(i.connectorId)?.state === 'connected' : false,
      keySaved: keys.length > 0 && keys.every((k) => Boolean(savedEnv[k])),
    };
  });
}

/** Catalog grouped by category, in the canonical category order, skipping any
 *  category with no tools. */
export function integrationsByCategory(
  entries: Integration[] = INTEGRATIONS,
): Map<IntegrationCategory, Integration[]> {
  const out = new Map<IntegrationCategory, Integration[]>();
  for (const cat of INTEGRATION_CATEGORIES) {
    const tools = entries.filter((i) => i.category === cat);
    if (tools.length) out.set(cat, tools);
  }
  return out;
}
