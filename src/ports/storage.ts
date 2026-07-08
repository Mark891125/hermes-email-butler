import type { MailItem } from './mail-provider.js';
import type { GeneratedReport } from './report-generator.js';

export type OperationStatus = 'success' | 'failed';
export type TaskType = 'collect-mails' | 'generate-report';

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

export interface SavedReport extends GeneratedReport {
  id: string;
  source: string;
  createdAt: Date;
  mailCount: number;
}

export interface SaveReportInput extends GeneratedReport {
  source: string;
  mailCount: number;
}

export interface Storage {
  saveMailItems(items: MailItem[]): Promise<MailItem[]>;
  listPendingMails(input?: { source?: string; limit?: number }): Promise<MailItem[]>;
  markMailsProcessed(ids: string[]): Promise<void>;
  saveReport(input: SaveReportInput): Promise<SavedReport>;
  getLatestReport(): Promise<SavedReport | null>;
  recordOperation(input: Omit<OperationRecord, 'id'>): Promise<OperationRecord>;
  listOperations(input?: { limit?: number }): Promise<OperationRecord[]>;
  close?(): void;
}
