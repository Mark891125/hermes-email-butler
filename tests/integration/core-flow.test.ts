import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { collectMails } from '../../src/core/collect-mails.js';
import { generateReport } from '../../src/core/generate-report.js';
import { listLatestReport } from '../../src/core/list-latest-report.js';
import { listTasks } from '../../src/core/list-tasks.js';
import { createSqliteStorage } from '../../src/infra/db/client.js';
import { MockMailProvider } from '../../src/mocks/mock-mail-provider.js';
import { MockReportGenerator } from '../../src/mocks/mock-report-generator.js';

describe('core service with sqlite storage', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'hermes-data-test-'));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('collects mails, generates a report, and records operations', async () => {
    const storage = createSqliteStorage({ databasePath: join(dir, 'app.sqlite') });

    const collectResult = await collectMails({
      since: '24h',
      source: 'mock',
      provider: new MockMailProvider(),
      storage
    });

    const reportResult = await generateReport({
      source: 'mock',
      storage,
      generator: new MockReportGenerator()
    });

    const latest = await listLatestReport({ storage });
    const tasks = await listTasks({ storage, limit: 10 });

    storage.close?.();

    expect(collectResult.processedCount).toBeGreaterThan(0);
    expect(reportResult.report.title).toContain('mock');
    expect(latest.report?.id).toBe(reportResult.report.id);
    expect(tasks.tasks).toHaveLength(2);
    expect(tasks.tasks.map((task) => task.status)).toEqual(['success', 'success']);
  });
});
