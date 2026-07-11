import type { MailItem } from './mail-provider.js';

export type OperationStatus = 'success' | 'failed';
export type TaskType = 'collect-mails' | 'claim-report' | 'submit-report';
export type ReportStatus = 'pending' | 'processing' | 'summarized';
export type ReportTaskStatus = 'claimed' | 'completed' | 'expired';

export interface OperationRecord {
  id: string;
  taskType: TaskType;
  source: string;
  input: unknown;
  status: OperationStatus;
  startedAt: Date;
  endedAt: Date;
  durationMs: number;
  processedCount: number;
  errorMessage: string | null;
}

export interface MailSyncState {
  id: string;
  provider: string;
  folder: string;
  deltaLink: string | null;
  initialWindowDays: number;
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SaveMailSyncStateInput {
  provider: string;
  folder: string;
  deltaLink: string | null;
  initialWindowDays: number;
  lastSyncedAt: Date;
}

export interface OAuthTokenRecord {
  provider: string;
  refreshToken: string;
  scope: string | null;
  expiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SaveOAuthTokenInput {
  provider: string;
  refreshToken: string;
  scope?: string | null;
  expiresAt?: Date | null;
}

export interface ReportTask {
  id: string;
  source: string;
  status: ReportTaskStatus;
  claimedAt: Date;
  expiresAt: Date;
  reportedAt: Date | null;
  summary: string | null;
  mailCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface ClaimReportTaskInput {
  source: string;
  limit: number;
  now: Date;
  expiresAt: Date;
}

export interface ClaimReportTaskResult {
  task: ReportTask | null;
  mails: MailItem[];
  expiredTaskCount: number;
}

export interface SubmitReportTaskInput {
  taskId: string;
  summary: string;
  now: Date;
}

export interface Storage {
  saveMailItems(items: MailItem[]): Promise<MailItem[]>;
  markMailItemsDeleted(input: { provider: string; messageIds: string[] }): Promise<void>;
  listPendingMails(input?: { source?: string; limit?: number }): Promise<MailItem[]>;
  getMailSyncState(input: { provider: string; folder: string }): Promise<MailSyncState | null>;
  upsertMailSyncState(input: SaveMailSyncStateInput): Promise<MailSyncState>;
  getOAuthToken(provider: string): Promise<OAuthTokenRecord | null>;
  upsertOAuthToken(input: SaveOAuthTokenInput): Promise<OAuthTokenRecord>;
  claimReportTask(input: ClaimReportTaskInput): Promise<ClaimReportTaskResult>;
  submitReportTask(input: SubmitReportTaskInput): Promise<ReportTask>;
  recordOperation(input: Omit<OperationRecord, 'id'>): Promise<OperationRecord>;
  listOperations(input?: { limit?: number }): Promise<OperationRecord[]>;
  close?(): void;
}
