export type CommsSource = 'email' | 'slack';
export type CommsItem = {
  source: CommsSource;
  title: string;
  preview: string;
  ts: string;
  unread?: number;
  sender?: string;
  replyTo?: string;
  account?: string;
  subject?: string;
  emailUid?: number;
  emailThreadId?: string;
  emailMessageId?: string;
  starred?: boolean;
};