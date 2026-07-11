export type MailImportance = 'low' | 'normal' | 'high';

export interface MailAttachment {
  externalId: string;
  name: string;
  contentType: string;
  size: number;
}

export interface MailItem {
  id?: string;
  externalId: string;
  messageId: string;
  conversationId: string;
  provider: string;
  subject: string;
  sender: string;
  fromName: string;
  fromAddress: string;
  receivedAt: Date;
  snippet: string;
  bodyPreview: string;
  bodyText: string;
  attachments: MailAttachment[];
  isRead: boolean;
  importance: MailImportance;
  isDeleted: boolean;
  deletedAt: Date | null;
}

export interface CollectMailInput {
  since?: string;
  deltaLink?: string | null;
  initialWindowDays?: number;
  pageSize?: number;
}

export interface CollectMailResult {
  items: MailItem[];
  deletedMessageIds: string[];
  deltaLink: string | null;
  pageCount: number;
}

export interface MailProvider {
  collect(input: CollectMailInput): Promise<CollectMailResult>;
}
