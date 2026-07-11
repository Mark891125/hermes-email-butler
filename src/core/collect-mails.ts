import type { MailProvider } from '../ports/mail-provider.js';
import type { OperationRecord, Storage } from '../ports/storage.js';

export interface CollectMailsInput {
  since?: string;
  source: string;
  provider: MailProvider;
  storage: Storage;
  initialWindowDays?: number;
  pageSize?: number;
}

export interface CollectMailsResult {
  processedCount: number;
  deletedCount: number;
  operation: OperationRecord;
}

export const collectMails = async (input: CollectMailsInput): Promise<CollectMailsResult> => {
  const startedAt = new Date();
  let processedCount = 0;
  let deletedCount = 0;
  const initialWindowDays = input.initialWindowDays ?? 7;
  const pageSize = input.pageSize ?? 3;
  const folder = 'Inbox';

  try {
    const syncState = await input.storage.getMailSyncState({ provider: input.source, folder });
    const result = await input.provider.collect({
      since: input.since,
      deltaLink: syncState?.deltaLink ?? null,
      initialWindowDays,
      pageSize
    });
    const saved = await input.storage.saveMailItems(result.items);
    await input.storage.markMailItemsDeleted({ provider: input.source, messageIds: result.deletedMessageIds });
    if (result.deltaLink) {
      await input.storage.upsertMailSyncState({
        provider: input.source,
        folder,
        deltaLink: result.deltaLink,
        initialWindowDays,
        lastSyncedAt: new Date()
      });
    }
    processedCount = saved.length;
    deletedCount = result.deletedMessageIds.length;
    const endedAt = new Date();
    const operation = await input.storage.recordOperation({
      taskType: 'collect-mails',
      source: input.source,
      input: { since: input.since, source: input.source, initialWindowDays, pageSize, pageCount: result.pageCount },
      status: 'success',
      startedAt,
      endedAt,
      durationMs: endedAt.getTime() - startedAt.getTime(),
      processedCount: processedCount + deletedCount,
      errorMessage: null
    });

    return { processedCount, deletedCount, operation };
  } catch (error) {
    const endedAt = new Date();
    await input.storage.recordOperation({
      taskType: 'collect-mails',
      source: input.source,
      input: { since: input.since, source: input.source, initialWindowDays, pageSize },
      status: 'failed',
      startedAt,
      endedAt,
      durationMs: endedAt.getTime() - startedAt.getTime(),
      processedCount: processedCount + deletedCount,
      errorMessage: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
};
