import type { ReportGenerator } from '../ports/report-generator.js';
import type { OperationRecord, SavedReport, Storage } from '../ports/storage.js';

export interface GenerateReportServiceInput {
  source: string;
  storage: Storage;
  generator: ReportGenerator;
}

export interface GenerateReportServiceResult {
  report: SavedReport;
  processedCount: number;
  operation: OperationRecord;
}

export const generateReport = async (input: GenerateReportServiceInput): Promise<GenerateReportServiceResult> => {
  const startedAt = new Date();
  let processedCount = 0;

  try {
    const mailItems = await input.storage.listPendingMails({ source: input.source, limit: 100 });
    processedCount = mailItems.length;
    const generated = await input.generator.generate({ source: input.source, mailItems });
    const report = await input.storage.saveReport({ ...generated, source: input.source, mailCount: processedCount });
    await input.storage.markMailsProcessed(mailItems.flatMap((item) => (item.id ? [item.id] : [])));

    const endedAt = new Date();
    const operation = await input.storage.recordOperation({
      taskType: 'generate-report',
      source: input.source,
      input: { source: input.source },
      status: 'success',
      startedAt,
      endedAt,
      durationMs: endedAt.getTime() - startedAt.getTime(),
      processedCount,
      errorMessage: null
    });

    return { report, processedCount, operation };
  } catch (error) {
    const endedAt = new Date();
    await input.storage.recordOperation({
      taskType: 'generate-report',
      source: input.source,
      input: { source: input.source },
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
