import type { OperationRecord, ReportTask, Storage } from '../ports/storage.js';

export interface SubmitReportTaskInput {
  storage: Storage;
  taskId: string;
  summary: string;
  source?: string;
  now?: () => Date;
}

export interface SubmitReportTaskResult extends ReportTask {
  operation: OperationRecord;
}

export const submitReportTask = async (input: SubmitReportTaskInput): Promise<SubmitReportTaskResult> => {
  const startedAt = input.now?.() ?? new Date();
  const summary = input.summary.trim();
  if (!summary) {
    throw new Error('Report summary must not be empty');
  }

  try {
    const task = await input.storage.submitReportTask({ taskId: input.taskId, summary, now: startedAt });
    const endedAt = input.now?.() ?? new Date();
    const operation = await input.storage.recordOperation({
      taskType: 'submit-report',
      source: task.source,
      input: { taskId: task.id },
      status: 'success',
      startedAt,
      endedAt,
      durationMs: endedAt.getTime() - startedAt.getTime(),
      processedCount: task.mailCount,
      errorMessage: null
    });
    return { ...task, operation };
  } catch (error) {
    const endedAt = input.now?.() ?? new Date();
    await input.storage.recordOperation({
      taskType: 'submit-report',
      source: input.source ?? 'microsoft',
      input: { taskId: input.taskId },
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
