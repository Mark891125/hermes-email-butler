import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { claimReportTask } from '../../src/core/claim-report-task.js';
import { submitReportTask } from '../../src/core/submit-report-task.js';
import { createSqliteStorage } from '../../src/infra/db/client.js';
import type { MailItem } from '../../src/ports/mail-provider.js';
import type { Storage } from '../../src/ports/storage.js';

const mail = (messageId: string, receivedAt: string): MailItem => ({
  externalId: messageId,
  messageId,
  conversationId: `conversation-${messageId}`,
  provider: 'microsoft',
  subject: `Subject ${messageId}`,
  sender: `${messageId}@example.com`,
  fromName: 'Sender',
  fromAddress: `${messageId}@example.com`,
  receivedAt: new Date(receivedAt),
  snippet: `Preview ${messageId}`,
  bodyPreview: `Preview ${messageId}`,
  bodyText: `Complete body ${messageId}`,
  attachments: [],
  isRead: false,
  importance: 'normal',
  isDeleted: false,
  deletedAt: null
});

describe('report task flow with sqlite storage', () => {
  let dir: string;
  let storage: Storage;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'hermes-report-task-'));
    storage = createSqliteStorage({ databasePath: join(dir, 'app.sqlite') });
    await storage.saveMailItems([
      mail('mail-1', '2026-07-10T09:00:00.000Z'),
      mail('mail-2', '2026-07-10T10:00:00.000Z'),
      mail('mail-3', '2026-07-10T11:00:00.000Z')
    ]);
  });

  afterEach(async () => {
    storage.close?.();
    await rm(dir, { recursive: true, force: true });
  });

  it('claims the newest pending mails and completes them from an Agent summary', async () => {
    const claimedAt = new Date('2026-07-11T10:00:00.000Z');
    const claim = await claimReportTask({ storage, source: 'microsoft', limit: 2, now: () => claimedAt });

    expect(claim.task).toMatchObject({ status: 'claimed', mailCount: 2, expiresAt: new Date('2026-07-11T10:30:00.000Z') });
    expect(claim.mails.map((item) => item.messageId)).toEqual(['mail-3', 'mail-2']);
    expect(claim.mails[0]?.bodyText).toBe('Complete body mail-3');
    const auditDb = new Database(join(dir, 'app.sqlite'), { readonly: true });
    const archivedMails = auditDb.prepare('select message_id, subject from report_task_mail_items where task_id = ? order by received_at desc').all(claim.task!.id);
    auditDb.close();
    expect(archivedMails).toEqual([
      { message_id: 'mail-3', subject: 'Subject mail-3' },
      { message_id: 'mail-2', subject: 'Subject mail-2' }
    ]);

    const completed = await submitReportTask({
      storage,
      taskId: claim.task!.id,
      summary: '# Daily summary\n\nTwo newest emails were sent to IM.',
      now: () => new Date('2026-07-11T10:05:00.000Z')
    });

    expect(completed).toMatchObject({
      status: 'completed',
      summary: '# Daily summary\n\nTwo newest emails were sent to IM.',
      reportedAt: new Date('2026-07-11T10:05:00.000Z')
    });
    expect((await storage.listPendingMails({ source: 'microsoft', limit: 10 })).map((item) => item.messageId)).toEqual(['mail-1']);
  });

  it('expires abandoned tasks and rejects a late report while allowing the mails to be claimed again', async () => {
    const firstClaim = await claimReportTask({
      storage,
      source: 'microsoft',
      limit: 1,
      now: () => new Date('2026-07-11T10:00:00.000Z')
    });

    await expect(
      submitReportTask({
        storage,
        taskId: firstClaim.task!.id,
        summary: 'Late summary',
        now: () => new Date('2026-07-11T10:31:00.000Z')
      })
    ).rejects.toThrow('Report task has expired');

    const reclaimed = await claimReportTask({
      storage,
      source: 'microsoft',
      limit: 1,
      now: () => new Date('2026-07-11T10:31:00.000Z')
    });

    expect(reclaimed.mails.map((item) => item.messageId)).toEqual(['mail-3']);
  });

  it('returns the original completed task when a submission is retried', async () => {
    const claim = await claimReportTask({
      storage,
      source: 'microsoft',
      limit: 1,
      now: () => new Date('2026-07-11T10:00:00.000Z')
    });
    const first = await submitReportTask({
      storage,
      taskId: claim.task!.id,
      summary: 'Original summary',
      now: () => new Date('2026-07-11T10:02:00.000Z')
    });
    const replay = await submitReportTask({
      storage,
      taskId: claim.task!.id,
      summary: 'Attempted replacement',
      now: () => new Date('2026-07-11T10:03:00.000Z')
    });

    expect(replay).toMatchObject({
      id: first.id,
      status: 'completed',
      reportedAt: first.reportedAt,
      summary: first.summary
    });
    expect(replay.summary).toBe('Original summary');
  });
});
