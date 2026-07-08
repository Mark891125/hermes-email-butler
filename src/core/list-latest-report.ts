import type { SavedReport, Storage } from '../ports/storage.js';

export interface ListLatestReportInput {
  storage: Storage;
}

export interface ListLatestReportResult {
  report: SavedReport | null;
}

export const listLatestReport = async (input: ListLatestReportInput): Promise<ListLatestReportResult> => ({
  report: await input.storage.getLatestReport()
});
