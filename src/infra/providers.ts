import type { MailProvider } from '../ports/mail-provider.js';
import type { ReportGenerator } from '../ports/report-generator.js';
import { MockMailProvider } from '../mocks/mock-mail-provider.js';
import { MockReportGenerator } from '../mocks/mock-report-generator.js';

export const createMailProvider = (provider: string): MailProvider => {
  if (provider === 'mock') {
    return new MockMailProvider();
  }

  throw new Error(`Unsupported mail provider: ${provider}`);
};

export const createReportGenerator = (source: string): ReportGenerator => {
  if (source === 'mock') {
    return new MockReportGenerator();
  }

  throw new Error(`Unsupported report source: ${source}`);
};
