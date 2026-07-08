import { describe, expect, it } from 'vitest';

import { MockMailProvider } from '../../src/mocks/mock-mail-provider.js';
import { MockReportGenerator } from '../../src/mocks/mock-report-generator.js';

describe('mock providers', () => {
  it('returns mock mails for a lookback window', async () => {
    const provider = new MockMailProvider();

    const result = await provider.collect({ since: '24h' });

    expect(result.items.length).toBeGreaterThan(0);
    expect(result.items[0]).toMatchObject({ provider: 'mock', status: 'pending' });
  });

  it('generates a report from mail items', async () => {
    const generator = new MockReportGenerator();

    const report = await generator.generate({
      source: 'mock',
      mailItems: [
        {
          externalId: 'mail-1',
          provider: 'mock',
          subject: 'Quarterly budget',
          sender: 'finance@example.com',
          receivedAt: new Date('2026-07-08T08:00:00.000Z'),
          snippet: 'Please review budget updates.',
          status: 'pending'
        }
      ]
    });

    expect(report.title).toContain('mock');
    expect(report.summary).toContain('1 mail');
  });
});
