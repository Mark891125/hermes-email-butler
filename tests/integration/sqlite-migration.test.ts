import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { createSqliteStorage } from '../../src/infra/db/client.js';

describe('SQLite report-task migration', () => {
  let dir: string | undefined;

  afterEach(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('rebuilds legacy mail_items without status and preserves processed mail as summarized', async () => {
    dir = await mkdtemp(join(tmpdir(), 'hermes-sqlite-migration-'));
    const databasePath = join(dir, 'app.sqlite');
    const legacy = new Database(databasePath);
    legacy.exec(`
      create table mail_items (
        id text primary key,
        external_id text not null,
        provider text not null,
        subject text not null,
        sender text not null,
        received_at text not null,
        snippet text not null,
        status text not null,
        created_at text not null,
        updated_at text not null
      );
      insert into mail_items values (
        'legacy-mail', 'legacy-message', 'microsoft', 'Legacy subject', 'sender@example.com',
        '2026-07-10T10:00:00.000Z', 'Legacy preview', 'processed',
        '2026-07-10T10:00:00.000Z', '2026-07-10T10:00:00.000Z'
      );
    `);
    legacy.close();

    const storage = createSqliteStorage({ databasePath });
    expect(await storage.listPendingMails({ source: 'microsoft', limit: 10 })).toEqual([]);
    storage.close?.();

    const migrated = new Database(databasePath, { readonly: true });
    const columns = migrated.prepare('pragma table_info(mail_items)').all() as Array<{ name: string }>;
    const row = migrated.prepare('select message_id, report_status from mail_items where id = ?').get('legacy-mail') as { message_id: string; report_status: string };
    migrated.close();

    expect(columns.map((column) => column.name)).not.toContain('status');
    expect(row).toEqual({ message_id: 'legacy-message', report_status: 'summarized' });
  });
});
