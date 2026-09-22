import { describe, expect, test } from 'vitest';

import { AlphaVantageMarketTool } from '@/lib/control-plane/alpha-vantage-market-tool';
import { TavilyWebSearchTool } from '@/lib/control-plane/tavily-web-search-tool';

describe('real provider read-tool adapters', () => {
  test('Tavily maps search results to provenance without leaking credentials', async () => {
    let auth = '';
    const tool = new TavilyWebSearchTool(async (_url, init) => {
      auth = new Headers(init?.headers).get('authorization') ?? '';
      return new Response(JSON.stringify({
        results: [{
          title: 'Example',
          url: 'https://example.com/article',
          content: 'Evidence.',
          score: 0.9,
        }],
        request_id: 'req-1',
        usage: { credits: 1 },
      }), { status: 200 });
    }, () => '2026-01-01T00:00:00.000Z');

    const result = await tool.invoke({
      args: { query: 'example evidence', maxResults: 1 },
      credentials: { get: () => 'tavily-secret' },
      signal: new AbortController().signal,
    });

    expect(auth).toBe('Bearer tavily-secret');
    expect(result.provenance[0]).toMatchObject({
      sourceType: 'web',
      uri: 'https://example.com/article',
      provider: 'Tavily',
    });
    expect(JSON.stringify(result)).not.toContain('tavily-secret');
  });

  test('Alpha Vantage maps GLOBAL_QUOTE to market-data provenance', async () => {
    const tool = new AlphaVantageMarketTool(async (url) => {
      expect(String(url)).toContain('function=GLOBAL_QUOTE');
      return new Response(JSON.stringify({
        'Global Quote': {
          '01. symbol': 'IBM',
          '05. price': '250.00',
          '07. latest trading day': '2026-01-01',
        },
      }), { status: 200 });
    }, () => '2026-01-01T00:00:00.000Z');

    const result = await tool.invoke({
      args: { operation: 'quote', symbol: 'IBM' },
      credentials: { get: () => 'alpha-secret' },
      signal: new AbortController().signal,
    });

    expect(result.data).toMatchObject({ symbol: 'IBM', price: '250.00' });
    expect(result.provenance[0]).toMatchObject({
      sourceType: 'market_data',
      provider: 'Alpha Vantage',
    });
    expect(JSON.stringify(result)).not.toContain('alpha-secret');
  });
});
