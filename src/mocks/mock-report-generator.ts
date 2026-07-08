import type { GenerateReportInput, GeneratedReport, ReportGenerator } from '../ports/report-generator.js';

export class MockReportGenerator implements ReportGenerator {
  async generate(input: GenerateReportInput): Promise<GeneratedReport> {
    const count = input.mailItems.length;
    const subjects = input.mailItems.map((item) => `- ${item.subject} (${item.sender})`).join('\n');

    return {
      title: `Mock ${input.source} mail report`,
      summary: `Generated from ${count} mail${count === 1 ? '' : 's'}.`,
      content:
        count > 0
          ? `Key mail items:\n${subjects}`
          : 'No pending mail items were available for this report.'
    };
  }
}
