import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { execa } from 'execa';
import { describe, expect, it } from 'vitest';

import { createSqliteStorage } from '../../src/infra/db/client.js';

describe('CLI', () => {
  it('prints health as JSON', async () => {
    const { stdout } = await execa('bun', ['run', 'dev', '--', 'health']);

    const payload = JSON.parse(stdout);
    expect(payload).toMatchObject({ ok: true, service: 'hermes-data-gateway' });
  });

  it('runs sync from the top-level command and reports a clear missing-token error', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hermes-data-cli-test-'));

    try {
      const result = await execa('bun', ['run', 'dev', '--', 'sync'], {
        reject: false,
        env: {
          HERMES_DATABASE_PATH: join(dir, 'app.sqlite'),
          MICROSOFT_CLIENT_ID: 'client-id',
          MICROSOFT_TENANT_ID: 'tenant-id',
          MICROSOFT_CLIENT_SECRET: 'client-secret',
          MICROSOFT_REDIRECT_URI: 'http://localhost:3000/auth/callback'
        }
      });
      const payload = JSON.parse(result.stdout);

      expect(result.exitCode).toBe(1);
      expect(payload).toMatchObject({
        ok: false,
        error: 'Microsoft OAuth token not found. Run `hd login` first.'
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('runs login from the top-level command and reports missing Microsoft configuration', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hermes-data-cli-login-test-'));

    try {
      const result = await execa('bun', ['run', 'dev', '--', 'login'], {
        reject: false,
        env: {
          HERMES_DATABASE_PATH: join(dir, 'app.sqlite'),
          MICROSOFT_CLIENT_ID: '',
          MICROSOFT_TENANT_ID: '',
          MICROSOFT_CLIENT_SECRET: ''
        }
      });
      const payload = JSON.parse(result.stdout);

      expect(result.exitCode).toBe(1);
      expect(payload).toMatchObject({
        ok: false,
        error: 'Missing Microsoft configuration: MICROSOFT_CLIENT_ID, MICROSOFT_TENANT_ID, MICROSOFT_CLIENT_SECRET'
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('claims mail and submits an Agent summary from standard input', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'hermes-data-cli-report-'));
    const databasePath = join(dir, 'app.sqlite');
    const storage = createSqliteStorage({ databasePath });
    await storage.saveMailItems([
      {
        externalId: 'mail-1',
        messageId: 'mail-1',
        conversationId: 'conversation-1',
        provider: 'microsoft',
        subject: 'Important update',
        sender: 'sender@example.com',
        fromName: 'Sender',
        fromAddress: 'sender@example.com',
        receivedAt: new Date('2026-07-11T10:00:00.000Z'),
        snippet: 'Preview',
        bodyPreview: 'Preview',
        bodyText: 'Complete body',
        attachments: [],
        isRead: false,
        importance: 'normal',
        isDeleted: false,
        deletedAt: null
      }
    ]);
    storage.close?.();

    try {
      const claim = await execa('bun', ['run', 'dev', '--', 'reports', 'claim', '--limit', '1'], {
        env: { HERMES_DATABASE_PATH: databasePath }
      });
      const claimed = JSON.parse(claim.stdout);
      expect(claimed).toMatchObject({ ok: true, task: { status: 'claimed', mailCount: 1 } });
      expect(claimed.mails[0]).toMatchObject({ messageId: 'mail-1', bodyText: 'Complete body' });

      const submitted = await execa('bun', ['run', 'dev', '--', 'reports', 'submit', claimed.task.id], {
        input: '# Daily summary\n\nSent through IM.',
        env: { HERMES_DATABASE_PATH: databasePath }
      });
      expect(JSON.parse(submitted.stdout)).toMatchObject({ ok: true, status: 'completed', summary: '# Daily summary\n\nSent through IM.' });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
