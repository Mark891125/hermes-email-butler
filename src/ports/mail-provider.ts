export type MailStatus = 'pending' | 'processed';

export interface MailItem {
  id?: string;
  externalId: string;
  provider: string;
  subject: string;
  sender: string;
  receivedAt: Date;
  snippet: string;
  status: MailStatus;
}

export interface CollectMailInput {
  since: string;
}

export interface CollectMailResult {
  items: MailItem[];
}

export interface MailProvider {
  collect(input: CollectMailInput): Promise<CollectMailResult>;
}
