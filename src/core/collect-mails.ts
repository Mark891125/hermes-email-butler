import type { MailProvider } from '../ports/mail-provider.js';
import type { OperationRecord, Storage } from '../ports/storage.js';

export interface CollectMailsInput {
  since: string;
  source: string;
  provider: MailProvider;
  storage: Storage;
}

export interface CollectMailsResult {
  processedCount: number;
  operation: OperationRecord;
}

export const collectMails = async (input: CollectMailsInput): Promise<CollectMailsResult> => {
  const startedAt = new Date();
  let processedCount = 0;

  try {
    const result = await input.provider.collect({ since: input.since });
    const saved = await input.storage.saveMailItems(result.items);
    processedCount = saved.length;
    const endedAt = new Date();
    const operation = await input.storage.recordOperation({
      taskType: 'collect-mails',
      source: input.source,
      input: { since: input.since, source: input.source },
      status: 'success',
      startedAt,
      endedAt,
      durationMs: endedAt.getTime() - startedAt.getTime(),
      processedCount,
      errorMessage: null
    });

    return { processedCount, operation };
  } catch (error) {
    const endedAt = new Date();
    await input.storage.recordOperation({
      taskType: 'collect-mails',
      source: input.source,
      input: { since: input.since, source: input.source },
      status: 'failed',
      startedAt,
      endedAt,
      durationMs: endedAt.getTime() - startedAt.getTime(),
      processedCount,
      errorMessage: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
};
