import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { collectMails } from '../../src/core/collect-mails.js';
import { createSqliteStorage } from '../../src/infra/db/client.js';
import type { CollectMailInput, CollectMailResult, MailItem, MailProvider } from '../../src/ports/mail-provider.js';
import type { Storage } from '../../src/ports/storage.js';

const mail = (messageId: string, overrides: Partial<MailItem> = {}): MailItem => ({
  externalId: messageId,
  messageId,
  conversationId: `conversation-${messageId}`,
  provider: 'microsoft',
  subject: `Subject ${messageId}`,
  sender: `${messageId}@example.com`,
  fromName: `Sender ${messageId}`,
  fromAddress: `${messageId}@example.com`,
  receivedAt: new Date('2026-07-09T10:00:00.000Z'),
  snippet: `Preview ${messageId}`,
  bodyPreview: `Preview ${messageId}`,
  bodyText: `Body ${messageId}`,
  attachments: [],
  isRead: false,
  importance: 'normal',
  isDeleted: false,
  deletedAt: null,
  ...overrides
});

class RecordingProvider implements MailProvider {
  public inputs: CollectMailInput[] = [];

  constructor(private readonly result: CollectMailResult) {}

  async collect(input: CollectMailInput): Promise<CollectMailResult> {
    this.inputs.push(input);
    return this.result;
  }
}

describe('mail delta sync with sqlite storage', () => {
  let dir: string;
  let storage: Storage;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'hermes-mail-delta-test-'));
    storage = createSqliteStorage({ databasePath: join(dir, 'app.sqlite') });
  });

  afterEach(async () => {
    storage.close?.();
    await rm(dir, { recursive: true, force: true });
  });

  it('saves all messages from a completed delta round and stores the deltaLink', async () => {
    const provider = new RecordingProvider({
      items: ['mail-1', 'mail-2', 'mail-3', 'mail-4', 'mail-5', 'mail-6'].map((messageId) => mail(messageId)),
      deletedMessageIds: [],
      deltaLink: 'https://graph.microsoft.com/v1.0/me/mailFolders/Inbox/messages/delta?$deltatoken=done',
      pageCount: 2
    });

    const result = await collectMails({
      source: 'microsoft',
      provider,
      storage,
      initialWindowDays: 7,
      pageSize: 3
    });

    const pending = await storage.listPendingMails({ source: 'microsoft', limit: 10 });
    const state = await storage.getMailSyncState({ provider: 'microsoft', folder: 'Inbox' });

    expect(result.processedCount).toBe(6);
    expect(result.deletedCount).toBe(0);
    expect(pending).toHaveLength(6);
    expect(state?.deltaLink).toBe('https://graph.microsoft.com/v1.0/me/mailFolders/Inbox/messages/delta?$deltatoken=done');
    expect(provider.inputs[0]).toMatchObject({ deltaLink: null, initialWindowDays: 7, pageSize: 3 });
  });

  it('uses the stored deltaLink, upserts message state, and hides deleted messages from pending list', async () => {
    const firstProvider = new RecordingProvider({
      items: [mail('mail-1'), mail('mail-2')],
      deletedMessageIds: [],
      deltaLink: 'https://graph.microsoft.com/v1.0/me/mailFolders/Inbox/messages/delta?$deltatoken=first',
      pageCount: 1
    });

    await collectMails({
      source: 'microsoft',
      provider: firstProvider,
      storage,
      initialWindowDays: 7,
      pageSize: 3
    });

    const secondProvider = new RecordingProvider({
      items: [mail('mail-2', { isRead: true, importance: 'high' })],
      deletedMessageIds: ['mail-1'],
      deltaLink: 'https://graph.microsoft.com/v1.0/me/mailFolders/Inbox/messages/delta?$deltatoken=second',
      pageCount: 1
    });

    const secondResult = await collectMails({
      source: 'microsoft',
      provider: secondProvider,
      storage,
      initialWindowDays: 7,
      pageSize: 3
    });

    const pending = await storage.listPendingMails({ source: 'microsoft', limit: 10 });
    const state = await storage.getMailSyncState({ provider: 'microsoft', folder: 'Inbox' });

    expect(secondProvider.inputs[0].deltaLink).toBe('https://graph.microsoft.com/v1.0/me/mailFolders/Inbox/messages/delta?$deltatoken=first');
    expect(secondResult.processedCount).toBe(1);
    expect(secondResult.deletedCount).toBe(1);
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ messageId: 'mail-2', isRead: true, importance: 'high' });
    expect(state?.deltaLink).toBe('https://graph.microsoft.com/v1.0/me/mailFolders/Inbox/messages/delta?$deltatoken=second');
  });

  it('does not reset a claimed mail when a later delta update refreshes its metadata', async () => {
    await collectMails({
      source: 'microsoft',
      provider: new RecordingProvider({ items: [mail('mail-1')], deletedMessageIds: [], deltaLink: 'https://example.test/first', pageCount: 1 }),
      storage
    });
    await storage.claimReportTask({
      source: 'microsoft',
      limit: 1,
      now: new Date('2026-07-11T10:00:00.000Z'),
      expiresAt: new Date('2026-07-11T10:30:00.000Z')
    });

    await collectMails({
      source: 'microsoft',
      provider: new RecordingProvider({
        items: [mail('mail-1', { isRead: true, bodyText: 'Updated body' })],
        deletedMessageIds: [],
        deltaLink: 'https://example.test/second',
        pageCount: 1
      }),
      storage
    });

    expect(await storage.listPendingMails({ source: 'microsoft', limit: 10 })).toEqual([]);
  });
});
