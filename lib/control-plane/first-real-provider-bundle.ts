import { AgentReadToolRegistry } from '@/lib/control-plane/agent-tool-runtime';
import { listCompanyAgentRuntimeProfiles } from '@/lib/control-plane/agent-runtime-profile';
import { AlphaVantageMarketTool } from '@/lib/control-plane/alpha-vantage-market-tool';
import { AnthropicMessagesModelAdapter } from '@/lib/control-plane/anthropic-messages-adapter';
import {
  agentsWithCapability,
  EnvironmentAgentCredentialVault,
} from '@/lib/control-plane/environment-credential-vault';
import { EnvironmentRuntimeSecretSource } from '@/lib/control-plane/runtime-secret-source';
import { TavilyWebSearchTool } from '@/lib/control-plane/tavily-web-search-tool';

export function buildFirstRealProviderBundle(input: {
  env?:
    Readonly<
      Record<
        string,
        string | undefined
      >
    >;
  fetchImpl?: typeof fetch;
  clock?: () => string;
  anthropicModel?: string;
} = {}) {
  const env = input.env ?? process.env;
  const secretSource = new EnvironmentRuntimeSecretSource(env);
  const profiles = listCompanyAgentRuntimeProfiles();
  const credentialVault = new EnvironmentAgentCredentialVault(secretSource);

  credentialVault.register({
    handle: 'cred:tavily-web',
    provider: 'Tavily',
    secretNames: { apiKey: 'TAVILY_API_KEY' },
    allowedAgentIds: agentsWithCapability(profiles, 'web-research'),
    allowedCapabilities: ['web-research'],
  });

  credentialVault.register({
    handle: 'cred:alpha-vantage',
    provider: 'Alpha Vantage',
    secretNames: { apiKey: 'ALPHA_VANTAGE_API_KEY' },
    allowedAgentIds: agentsWithCapability(profiles, 'market-data'),
    allowedCapabilities: ['market-data'],
  });

  const toolRegistry = new AgentReadToolRegistry();
  toolRegistry.register(
    new TavilyWebSearchTool(input.fetchImpl, input.clock),
  );
  toolRegistry.register(
    new AlphaVantageMarketTool(input.fetchImpl, input.clock),
  );

  const modelAdapter = new AnthropicMessagesModelAdapter({
    secretSource,
    model:
      input.anthropicModel ?? env.ANTHROPIC_MODEL ?? 'claude-sonnet-5',
    fetchImpl: input.fetchImpl,
  });

  return {
    secretSource,
    credentialVault,
    toolRegistry,
    modelAdapter,
  };
}
