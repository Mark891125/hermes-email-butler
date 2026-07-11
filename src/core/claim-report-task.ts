import type { MailItem } from '../ports/mail-provider.js';
import type { OperationRecord, ReportTask, Storage } from '../ports/storage.js';

const CLAIM_TTL_MS = 30 * 60 * 1000;

export interface ClaimReportTaskInput {
  storage: Storage;
  source: string;
  limit?: number;
  now?: () => Date;
}

export interface ClaimReportTaskResult {
  task: ReportTask | null;
  mails: MailItem[];
  expiredTaskCount: number;
  operation: OperationRecord;
}

export const claimReportTask = async (input: ClaimReportTaskInput): Promise<ClaimReportTaskResult> => {
  const startedAt = input.now?.() ?? new Date();
  const limit = input.limit ?? 50;
  const expiresAt = new Date(startedAt.getTime() + CLAIM_TTL_MS);

  try {
    const result = await input.storage.claimReportTask({ source: input.source, limit, now: startedAt, expiresAt });
    const endedAt = input.now?.() ?? new Date();
    const operation = await input.storage.recordOperation({
      taskType: 'claim-report',
      source: input.source,
      input: { limit, expiredTaskCount: result.expiredTaskCount },
      status: 'success',
      startedAt,
      endedAt,
      durationMs: endedAt.getTime() - startedAt.getTime(),
      processedCount: result.mails.length,
      errorMessage: null
    });
    return { ...result, operation };
  } catch (error) {
    const endedAt = input.now?.() ?? new Date();
    await input.storage.recordOperation({
      taskType: 'claim-report',
      source: input.source,
      input: { limit },
      status: 'failed',
      startedAt,
      endedAt,
      durationMs: endedAt.getTime() - startedAt.getTime(),
      processedCount: 0,
      errorMessage: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
};
