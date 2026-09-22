import { z } from 'zod';

import type {
  AgentReadToolAdapter,
} from '@/lib/control-plane/agent-tool-runtime';

const QuoteArgsSchema = z.object({
  operation:
    z.literal('quote'),

  symbol:
    z.string()
      .trim()
      .min(1)
      .max(40),
});

const NewsArgsSchema = z.object({
  operation:
    z.literal('news'),

  tickers:
    z.array(
      z.string()
        .trim()
        .min(1)
        .max(40),
    )
    .min(1)
    .max(10),

  limit:
    z.coerce
      .number()
      .int()
      .min(1)
      .max(20)
      .default(10),
});

const AlphaVantageArgsSchema =
  z.discriminatedUnion(
    'operation',
    [
      QuoteArgsSchema,
      NewsArgsSchema,
    ],
  );

function trimText(
  value: unknown,
  maxChars = 3_000,
): string {
  if (
    typeof value !==
    'string'
  ) {
    return '';
  }

  return value.length >
    maxChars
    ? `${value.slice(
        0,
        maxChars,
      )}…`
    : value;
}

function providerError(
  payload:
    Record<string, unknown>,
): string | null {
  for (
    const key of [
      'Error Message',
      'Note',
      'Information',
    ]
  ) {
    const value =
      payload[key];

    if (
      typeof value ===
      'string' &&
      value.trim()
    ) {
      return value.trim();
    }
  }

  return null;
}

export class AlphaVantageMarketTool
  implements AgentReadToolAdapter
{
  readonly id =
    'alpha-vantage-market';

  readonly capability =
    'market-data' as const;

  readonly description =
    'Read Alpha Vantage data. Use operation "quote" with symbol for a latest quote, or operation "news" with tickers and optional limit.';

  readonly inputSchema = {
    type:
      'object',

    additionalProperties:
      false,

    properties: {
      operation: {
        type:
          'string',
        enum: [
          'quote',
          'news',
        ],
        description:
          'Use quote for a latest ticker quote; use news for ticker-related news.',
      },

      symbol: {
        type:
          'string',
        minLength: 1,
        maxLength: 40,
        description:
          'Required when operation is quote. Example: AAPL.',
      },

      tickers: {
        type:
          'array',
        minItems: 1,
        maxItems: 10,
        items: {
          type:
            'string',
        },
        description:
          'Required when operation is news.',
      },

      limit: {
        type:
          'integer',
        minimum: 1,
        maximum: 20,
      },
    },

    required: [
      'operation',
    ],
  };

  readonly credentialHandle =
    'cred:alpha-vantage';

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
        'alpha_vantage_credentials_required',
      );
    }

    const args =
      AlphaVantageArgsSchema.parse(
        input.args,
      );

    const apiKey =
      input.credentials.get(
        'apiKey',
      );

    if (
      args.operation ===
      'quote'
    ) {
      return this.quote(
        args.symbol,
        apiKey,
        input.signal,
      );
    }

    return this.news(
      args.tickers,
      args.limit,
      apiKey,
      input.signal,
    );
  }

  private async quote(
    symbol: string,
    apiKey: string,
    signal:
      AbortSignal,
  ) {
    const url =
      new URL(
        'https://www.alphavantage.co/query',
      );

    url.searchParams.set(
      'function',
      'GLOBAL_QUOTE',
    );

    url.searchParams.set(
      'symbol',
      symbol,
    );

    url.searchParams.set(
      'apikey',
      apiKey,
    );

    const response =
      await this.fetchImpl(
        url,
        {
          signal,
        },
      );

    if (!response.ok) {
      throw new Error(
        `alpha_vantage_quote_failed:${response.status}`,
      );
    }

    const payload =
      await response.json() as
        Record<string, unknown>;

    const error =
      providerError(
        payload,
      );

    if (error) {
      throw new Error(
        `alpha_vantage_provider_error:${error}`,
      );
    }

    const quote =
      (
        payload[
          'Global Quote'
        ] ??
        {}
      ) as Record<
        string,
        unknown
      >;

    if (
      Object.keys(
        quote,
      ).length === 0
    ) {
      throw new Error(
        `alpha_vantage_empty_quote:${symbol}`,
      );
    }

    const capturedAt =
      this.clock();

    const safeUri =
      `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(
        symbol,
      )}`;

    return {
      summary:
        `Alpha Vantage quote retrieved for ${symbol}.`,

      data: {
        symbol:
          quote[
            '01. symbol'
          ] ??
          symbol,

        open:
          quote[
            '02. open'
          ],

        high:
          quote[
            '03. high'
          ],

        low:
          quote[
            '04. low'
          ],

        price:
          quote[
            '05. price'
          ],

        volume:
          quote[
            '06. volume'
          ],

        latestTradingDay:
          quote[
            '07. latest trading day'
          ],

        previousClose:
          quote[
            '08. previous close'
          ],

        change:
          quote[
            '09. change'
          ],

        changePercent:
          quote[
            '10. change percent'
          ],
      },

      provenance: [
        {
          sourceType:
            'market_data' as const,

          uri:
            safeUri,

          title:
            `Alpha Vantage GLOBAL_QUOTE ${symbol}`,

          provider:
            'Alpha Vantage',

          capturedAt,

          primary:
            true,

          notes:
            'Latest quote returned by Alpha Vantage. Freshness depends on the account entitlement.',
        },
      ],

      observedAt:
        capturedAt,

      metadata: {
        provider:
          'alpha-vantage',

        operation:
          'quote',
      },
    };
  }

  private async news(
    tickers:
      string[],

    limit: number,

    apiKey: string,

    signal:
      AbortSignal,
  ) {
    const url =
      new URL(
        'https://www.alphavantage.co/query',
      );

    url.searchParams.set(
      'function',
      'NEWS_SENTIMENT',
    );

    url.searchParams.set(
      'tickers',
      tickers.join(','),
    );

    url.searchParams.set(
      'limit',
      String(limit),
    );

    url.searchParams.set(
      'sort',
      'LATEST',
    );

    url.searchParams.set(
      'apikey',
      apiKey,
    );

    const response =
      await this.fetchImpl(
        url,
        {
          signal,
        },
      );

    if (!response.ok) {
      throw new Error(
        `alpha_vantage_news_failed:${response.status}`,
      );
    }

    const payload =
      await response.json() as
        Record<string, unknown>;

    const error =
      providerError(
        payload,
      );

    if (error) {
      throw new Error(
        `alpha_vantage_provider_error:${error}`,
      );
    }

    const feed =
      Array.isArray(
        payload.feed,
      )
        ? payload.feed
        : [];

    const items =
      feed
        .slice(
          0,
          limit,
        )
        .map(
          (item) => {
            const record =
              item as Record<
                string,
                unknown
              >;

            return {
              title:
                trimText(
                  record.title,
                  500,
                ),

              url:
                trimText(
                  record.url,
                  2_000,
                ),

              source:
                trimText(
                  record.source,
                  200,
                ),

              timePublished:
                trimText(
                  record.time_published,
                  100,
                ),

              summary:
                trimText(
                  record.summary,
                ),

              overallSentimentScore:
                record.overall_sentiment_score,

              overallSentimentLabel:
                record.overall_sentiment_label,
            };
          },
        );

    const capturedAt =
      this.clock();

    return {
      summary:
        `Alpha Vantage returned ${items.length} news item(s) for ${tickers.join(
          ', ',
        )}.`,

      data: {
        tickers,
        items,
      },

      provenance:
        items
          .filter(
            (item) =>
              item.url.startsWith(
                'http',
              ),
          )
          .map(
            (item) => ({
              sourceType:
                'news' as const,

              uri:
                item.url,

              title:
                item.title ||
                undefined,

              publisher:
                item.source ||
                undefined,

              provider:
                'Alpha Vantage',

              capturedAt,

              primary:
                false,

              notes:
                'News item surfaced through Alpha Vantage NEWS_SENTIMENT.',
            }),
          ),

      observedAt:
        capturedAt,

      metadata: {
        provider:
          'alpha-vantage',

        operation:
          'news',
      },
    };
  }
}
