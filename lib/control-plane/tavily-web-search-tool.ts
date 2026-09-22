import { z } from 'zod';
import type { AgentReadToolAdapter } from '@/lib/control-plane/agent-tool-runtime';

const ArgsSchema = z.object({
  query: z.string().trim().min(2).max(500),
  topic: z.enum(['general', 'news']).default('general'),
  maxResults: z.coerce.number().int().min(1).max(10).default(5),
  timeRange: z.enum(['day', 'week', 'month', 'year']).optional(),
  includeDomains: z.array(z.string().min(1)).max(20).default([]),
  excludeDomains: z.array(z.string().min(1)).max(20).default([]),
});

const ResponseSchema = z.object({
  results: z.array(z.object({
    title: z.string().default(''),
    url: z.string().url(),
    content: z.string().default(''),
    score: z.number().optional(),
  })).default([]),
  request_id: z.string().optional(),
  response_time: z.union([z.string(), z.number()]).optional(),
  usage: z.object({ credits: z.number().optional() }).optional(),
});

function clip(value: string, max = 4000): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

export class TavilyWebSearchTool implements AgentReadToolAdapter {
  readonly id = 'tavily-web-search';
  readonly capability = 'web-research' as const;
  readonly description =
    'Search the public web or recent news for current external evidence. Args: query, topic, maxResults, timeRange, includeDomains, excludeDomains.';
  readonly credentialHandle = 'cred:tavily-web';

  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly clock: () => string = () => new Date().toISOString(),
  ) {}

  async invoke(input: {
    args: Record<string, unknown>;
    credentials?: { get(key: string): string };
    signal: AbortSignal;
  }) {
    if (!input.credentials) throw new Error('tavily_credentials_required');
    const args = ArgsSchema.parse(input.args);

    const response = await this.fetchImpl('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.credentials.get('apiKey')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: args.query,
        search_depth: 'basic',
        max_results: args.maxResults,
        topic: args.topic,
        time_range: args.timeRange ?? null,
        include_answer: false,
        include_raw_content: false,
        include_images: false,
        include_domains: args.includeDomains,
        exclude_domains: args.excludeDomains,
        safe_search: true,
      }),
      signal: input.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`tavily_search_failed:${response.status}:${clip(text, 500)}`);
    }

    const parsed = ResponseSchema.parse(await response.json());
    const capturedAt = this.clock();
    const results = parsed.results.map((r) => ({ ...r, content: clip(r.content) }));

    return {
      summary: `Tavily returned ${results.length} result(s) for "${args.query}".`,
      data: {
        query: args.query,
        topic: args.topic,
        results,
        requestId: parsed.request_id,
        responseTime: parsed.response_time,
        credits: parsed.usage?.credits,
      },
      provenance: results.map((r) => ({
        sourceType: args.topic === 'news' ? 'news' as const : 'web' as const,
        uri: r.url,
        title: r.title || undefined,
        provider: 'Tavily',
        capturedAt,
        primary: false,
        notes: 'Public search result returned by Tavily.',
      })),
      observedAt: capturedAt,
      metadata: {
        provider: 'tavily',
        requestId: parsed.request_id,
        credits: parsed.usage?.credits,
      },
    };
  }
}
