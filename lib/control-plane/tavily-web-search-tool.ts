import { z } from 'zod';

import type {
  AgentReadToolAdapter,
} from '@/lib/control-plane/agent-tool-runtime';

const TavilySearchArgsSchema = z.object({
  query:
    z.string().trim().min(2).max(500),

  topic:
    z.enum([
      'general',
      'news',
    ])
    .default('general'),

  maxResults:
    z.coerce
      .number()
      .int()
      .min(1)
      .max(10)
      .default(5),

  timeRange:
    z.enum([
      'day',
      'week',
      'month',
      'year',
    ])
    .optional(),

  includeDomains:
    z.array(
      z.string().min(1),
    )
    .max(20)
    .default([]),

  excludeDomains:
    z.array(
      z.string().min(1),
    )
    .max(20)
    .default([]),
});

const TavilyResultSchema = z.object({
  title:
    z.string().default(''),
  url:
    z.string().url(),
  content:
    z.string().default(''),
  score:
    z.number().optional(),
});

const TavilyResponseSchema = z.object({
  query:
    z.string().optional(),
  answer:
    z.string().nullable().optional(),
  results:
    z.array(
      TavilyResultSchema,
    )
    .default([]),
  response_time:
    z.union([
      z.string(),
      z.number(),
    ])
    .optional(),
  request_id:
    z.string().optional(),
  usage:
    z.object({
      credits:
        z.number().optional(),
    })
    .optional(),
});

function truncate(
  value: string,
  maxChars = 4_000,
): string {
  return value.length >
    maxChars
    ? `${value.slice(
        0,
        maxChars,
      )}…`
    : value;
}

export class TavilyWebSearchTool
  implements AgentReadToolAdapter
{
  readonly id =
    'tavily-web-search';

  readonly capability =
    'web-research' as const;

  readonly description =
    'Search the public web or recent news for current external evidence. Use query; topic can be general or news.';

  readonly inputSchema = {
    type:
      'object',

    additionalProperties:
      false,

    properties: {
      query: {
        type:
          'string',
        minLength: 2,
        maxLength: 500,
        description:
          'Search query.',
      },

      topic: {
        type:
          'string',
        enum: [
          'general',
          'news',
        ],
        description:
          'Use news for time-sensitive news searches; otherwise general.',
      },

      maxResults: {
        type:
          'integer',
        minimum: 1,
        maximum: 10,
      },

      timeRange: {
        type:
          'string',
        enum: [
          'day',
          'week',
          'month',
          'year',
        ],
      },

      includeDomains: {
        type:
          'array',
        maxItems: 20,
        items: {
          type:
            'string',
        },
      },

      excludeDomains: {
        type:
          'array',
        maxItems: 20,
        items: {
          type:
            'string',
        },
      },
    },

    required: [
      'query',
    ],
  };

  readonly credentialHandle =
    'cred:tavily-web';

  constructor(
    private readonly fetchImpl:
      typeof fetch = fetch,

    private readonly clock:
      () => string = () =>
        new Date().toISOString(),
  ) {}

  async invoke(input: {
    args:
      Record<string, unknown>;

    credentials?: {
      get(
        key: string,
      ): string;
    };

    signal:
      AbortSignal;
  }) {
    if (
      !input.credentials
    ) {
      throw new Error(
        'tavily_credentials_required',
      );
    }

    const args =
      TavilySearchArgsSchema.parse(
        input.args,
      );

    const response =
      await this.fetchImpl(
        'https://api.tavily.com/search',
        {
          method:
            'POST',

          headers: {
            Authorization:
              `Bearer ${input.credentials.get(
                'apiKey',
              )}`,

            'Content-Type':
              'application/json',
          },

          body:
            JSON.stringify({
              query:
                args.query,

              search_depth:
                'basic',

              max_results:
                args.maxResults,

              topic:
                args.topic,

              time_range:
                args.timeRange ??
                null,

              include_answer:
                false,

              include_raw_content:
                false,

              include_images:
                false,

              include_domains:
                args.includeDomains,

              exclude_domains:
                args.excludeDomains,

              safe_search:
                true,
            }),

          signal:
            input.signal,
        },
      );

    if (!response.ok) {
      const text =
        await response.text();

      throw new Error(
        `tavily_search_failed:${response.status}:${truncate(
          text,
          500,
        )}`,
      );
    }

    const parsed =
      TavilyResponseSchema.parse(
        await response.json(),
      );

    const capturedAt =
      this.clock();

    const results =
      parsed.results.map(
        (result) => ({
          title:
            result.title,

          url:
            result.url,

          content:
            truncate(
              result.content,
            ),

          score:
            result.score,
        }),
      );

    return {
      summary:
        `Tavily returned ${results.length} result(s) for "${args.query}".`,

      data: {
        query:
          args.query,
        topic:
          args.topic,
        results,
        requestId:
          parsed.request_id,
        responseTime:
          parsed.response_time,
        credits:
          parsed.usage
            ?.credits,
      },

      provenance:
        results.map(
          (result) => ({
            sourceType:
              args.topic ===
              'news'
                ? 'news' as const
                : 'web' as const,

            uri:
              result.url,

            title:
              result.title ||
              undefined,

            provider:
              'Tavily',

            capturedAt,

            primary:
              false,

            notes:
              'Public web search result returned by Tavily.',
          }),
        ),

      observedAt:
        capturedAt,

      metadata: {
        provider:
          'tavily',

        requestId:
          parsed.request_id,

        credits:
          parsed.usage
            ?.credits,
      },
    };
  }
}
