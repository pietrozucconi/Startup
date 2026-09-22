import {
  describe,
  expect,
  test,
} from 'vitest';

import {
  AgentReadToolRegistry,
} from '@/lib/control-plane/agent-tool-runtime';

import {
  TavilyWebSearchTool,
} from '@/lib/control-plane/tavily-web-search-tool';

import {
  AlphaVantageMarketTool,
} from '@/lib/control-plane/alpha-vantage-market-tool';

describe(
  'V2J.2 real tool schemas',
  () => {
    test(
      'model-visible descriptors contain argument schemas but no credential handles',
      () => {
        const registry =
          new AgentReadToolRegistry();

        registry.register(
          new TavilyWebSearchTool(),
        );

        registry.register(
          new AlphaVantageMarketTool(),
        );

        const descriptors =
          registry
            .listForCapabilities([
              'web-research',
              'market-data',
            ]);

        const serialized =
          JSON.stringify(
            descriptors,
          );

        expect(
          serialized,
        ).not.toContain(
          'cred:tavily-web',
        );

        expect(
          serialized,
        ).not.toContain(
          'cred:alpha-vantage',
        );

        const tavily =
          descriptors.find(
            (tool) =>
              tool.id ===
              'tavily-web-search',
          );

        expect(
          (
            tavily
              ?.inputSchema
              ?.properties as
              Record<
                string,
                unknown
              >
          )?.query,
        ).toBeDefined();

        const alpha =
          descriptors.find(
            (tool) =>
              tool.id ===
              'alpha-vantage-market',
          );

        expect(
          (
            alpha
              ?.inputSchema
              ?.properties as
              Record<
                string,
                unknown
              >
          )?.operation,
        ).toBeDefined();
      },
    );
  },
);
