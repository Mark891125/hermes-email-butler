import type { OperationRecord, Storage } from '../ports/storage.js';

export interface ListTasksInput {
  storage: Storage;
  limit?: number;
}

export interface ListTasksResult {
  tasks: OperationRecord[];
}

export const listTasks = async (input: ListTasksInput): Promise<ListTasksResult> => ({
  tasks: await input.storage.listOperations({ limit: input.limit })
});
