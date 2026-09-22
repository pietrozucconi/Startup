import { z } from 'zod';
import type { AgentReadToolAdapter } from '@/lib/control-plane/agent-tool-runtime';

const ArgsSchema = z.discriminatedUnion('operation', [
  z.object({
    operation: z.literal('quote'),
    symbol: z.string().trim().min(1).max(40),
  }),
  z.object({
    operation: z.literal('news'),
    tickers: z.array(z.string().trim().min(1).max(40)).min(1).max(10),
    limit: z.coerce.number().int().min(1).max(20).default(10),
  }),
]);

function providerError(payload: Record<string, unknown>): string | null {
  for (const key of ['Error Message', 'Note', 'Information']) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function text(value: unknown, max = 3000): string {
  if (typeof value !== 'string') return '';
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

export class AlphaVantageMarketTool implements AgentReadToolAdapter {
  readonly id = 'alpha-vantage-market';
  readonly capability = 'market-data' as const;
  readonly description =
    'Read Alpha Vantage market evidence. Args: {operation:"quote",symbol} or {operation:"news",tickers,limit}.';
  readonly credentialHandle = 'cred:alpha-vantage';

  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly clock: () => string = () => new Date().toISOString(),
  ) {}

  async invoke(input: {
    args: Record<string, unknown>;
    credentials?: { get(key: string): string };
    signal: AbortSignal;
  }) {
    if (!input.credentials) throw new Error('alpha_vantage_credentials_required');
    const args = ArgsSchema.parse(input.args);
    const apiKey = input.credentials.get('apiKey');

    const url = new URL('https://www.alphavantage.co/query');
    if (args.operation === 'quote') {
      url.searchParams.set('function', 'GLOBAL_QUOTE');
      url.searchParams.set('symbol', args.symbol);
    } else {
      url.searchParams.set('function', 'NEWS_SENTIMENT');
      url.searchParams.set('tickers', args.tickers.join(','));
      url.searchParams.set('limit', String(args.limit));
      url.searchParams.set('sort', 'LATEST');
    }
    url.searchParams.set('apikey', apiKey);

    const response = await this.fetchImpl(url, { signal: input.signal });
    if (!response.ok) {
      throw new Error(`alpha_vantage_failed:${response.status}`);
    }

    const payload = await response.json() as Record<string, unknown>;
    const error = providerError(payload);
    if (error) throw new Error(`alpha_vantage_provider_error:${error}`);
    const capturedAt = this.clock();

    if (args.operation === 'quote') {
      const quote = (payload['Global Quote'] ?? {}) as Record<string, unknown>;
      return {
        summary: `Alpha Vantage quote retrieved for ${args.symbol}.`,
        data: {
          symbol: quote['01. symbol'] ?? args.symbol,
          open: quote['02. open'],
          high: quote['03. high'],
          low: quote['04. low'],
          price: quote['05. price'],
          volume: quote['06. volume'],
          latestTradingDay: quote['07. latest trading day'],
          previousClose: quote['08. previous close'],
          change: quote['09. change'],
          changePercent: quote['10. change percent'],
        },
        provenance: [{
          sourceType: 'market_data' as const,
          uri: `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(args.symbol)}`,
          title: `Alpha Vantage GLOBAL_QUOTE ${args.symbol}`,
          provider: 'Alpha Vantage',
          capturedAt,
          primary: true,
          notes: 'Quote freshness depends on the Alpha Vantage account entitlement.',
        }],
        observedAt: capturedAt,
        metadata: { provider: 'alpha-vantage', operation: 'quote' },
      };
    }

    const feed = Array.isArray(payload.feed) ? payload.feed : [];
    const items = feed.slice(0, args.limit).map((item) => {
      const r = item as Record<string, unknown>;
      return {
        title: text(r.title, 500),
        url: text(r.url, 2000),
        source: text(r.source, 200),
        timePublished: text(r.time_published, 100),
        summary: text(r.summary),
        overallSentimentScore: r.overall_sentiment_score,
        overallSentimentLabel: r.overall_sentiment_label,
      };
    });

    return {
      summary: `Alpha Vantage returned ${items.length} news item(s) for ${args.tickers.join(', ')}.`,
      data: { tickers: args.tickers, items },
      provenance: items
        .filter((item) => item.url.startsWith('http'))
        .map((item) => ({
          sourceType: 'news' as const,
          uri: item.url,
          title: item.title || undefined,
          publisher: item.source || undefined,
          provider: 'Alpha Vantage',
          capturedAt,
          primary: false,
          notes: 'News item surfaced through Alpha Vantage NEWS_SENTIMENT.',
        })),
      observedAt: capturedAt,
      metadata: { provider: 'alpha-vantage', operation: 'news' },
    };
  }
}
