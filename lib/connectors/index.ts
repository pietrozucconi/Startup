import { emailStatus } from '@/lib/connectors/email';
import { calendarStatus } from '@/lib/connectors/gcal';
import { slackStatus } from '@/lib/connectors/slack';
import { notionStatus } from '@/lib/connectors/notion';
import { miroStatus } from '@/lib/connectors/miro';
import { llmStatus } from '@/lib/connectors/llm';
import { runtimeEnv } from '@/lib/creds';
import type { ConnectorStatus } from '@/lib/connectors/types';

const CHECKS: [string, ConnectorStatus['kind'], () => Promise<ConnectorStatus>][] = [
  ['llm', 'orchestration', llmStatus],
  ['miro', 'creative', miroStatus],
  ['email', 'email', () => emailStatus(runtimeEnv())],
  ['calendar', 'calendar', calendarStatus],
  ['slack', 'slack', () => slackStatus(runtimeEnv())],
  ['notion', 'notion', () => notionStatus(runtimeEnv())],
];

export async function allConnectorStatuses(): Promise<ConnectorStatus[]> {
  return Promise.all(
    CHECKS.map(([id, kind, check]) =>
      check().catch(
        (err): ConnectorStatus => ({
          id,
          name: id,
          kind,
          state: 'error',
          detail: err instanceof Error ? err.message : String(err),
        }),
      ),
    ),
  );
}
