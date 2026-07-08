import type { MailItem } from './mail-provider.js';

export interface GeneratedReport {
  title: string;
  summary: string;
  content: string;
}

export interface GenerateReportInput {
  source: string;
  mailItems: MailItem[];
}

export interface ReportGenerator {
  generate(input: GenerateReportInput): Promise<GeneratedReport>;
}
