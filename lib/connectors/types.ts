export type ConnectorState = 'connected' | 'not_configured' | 'error';

export type ConnectorKind =
  | 'email'
  | 'calendar'
  | 'slack'
  | 'notion'
  | 'creative'
  | 'orchestration';

export type ConnectorStatus = {
  id: string;
  name: string;
  kind: ConnectorKind;
  state: ConnectorState;
  detail: string;
  meta?: Record<string, string | number>;
};
