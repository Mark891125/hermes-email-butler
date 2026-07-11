import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import Database from 'better-sqlite3';

import type { MailAttachment, MailImportance, MailItem } from '../../ports/mail-provider.js';
import type {
  ClaimReportTaskInput,
  ClaimReportTaskResult,
  MailSyncState,
  OAuthTokenRecord,
  OperationRecord,
  OperationStatus,
  ReportTask,
  ReportTaskStatus,
  Storage,
  SubmitReportTaskInput,
  TaskType
} from '../../ports/storage.js';

interface CreateSqliteStorageInput {
  databasePath: string;
}

interface MailRow {
  id: string;
  external_id: string;
  message_id: string;
  conversation_id: string;
  provider: string;
  subject: string;
  sender: string;
  from_name: string;
  from_address: string;
  received_at: string;
  snippet: string;
  body_preview: string;
  body_text: string;
  report_status: string;
  report_task_id: string | null;
  is_read: number;
  importance: string;
  is_deleted: number;
  deleted_at: string | null;
}

interface AttachmentRow {
  external_id: string;
  name: string;
  content_type: string;
  size: number;
}

interface ReportTaskRow {
  id: string;
  source: string;
  status: string;
  claimed_at: string;
  expires_at: string;
  reported_at: string | null;
  summary: string | null;
  mail_count: number;
  created_at: string;
  updated_at: string;
}

const toIso = (date: Date): string => date.toISOString();
const fromIso = (value: string): Date => new Date(value);
const fromNullableIso = (value: string | null): Date | null => (value ? fromIso(value) : null);

const tableExists = (sqlite: Database.Database, table: string): boolean =>
  Boolean(sqlite.prepare("select 1 from sqlite_master where type = 'table' and name = ?").get(table));

const hasColumn = (sqlite: Database.Database, table: string, column: string): boolean => {
  if (!tableExists(sqlite, table)) return false;
  const rows = sqlite.prepare(`pragma table_info(${table})`).all() as Array<{ name: string }>;
  return rows.some((row) => row.name === column);
};

const addColumnIfMissing = (sqlite: Database.Database, table: string, column: string, definition: string): void => {
  if (!hasColumn(sqlite, table, column)) sqlite.exec(`alter table ${table} add column ${column} ${definition}`);
};

const migrateLegacyMailItems = (sqlite: Database.Database): void => {
  if (!hasColumn(sqlite, 'mail_items', 'status')) return;

  addColumnIfMissing(sqlite, 'mail_items', 'message_id', "text not null default ''");
  addColumnIfMissing(sqlite, 'mail_items', 'conversation_id', "text not null default ''");
  addColumnIfMissing(sqlite, 'mail_items', 'from_name', "text not null default ''");
  addColumnIfMissing(sqlite, 'mail_items', 'from_address', "text not null default ''");
  addColumnIfMissing(sqlite, 'mail_items', 'body_preview', "text not null default ''");
  addColumnIfMissing(sqlite, 'mail_items', 'body_text', "text not null default ''");
  addColumnIfMissing(sqlite, 'mail_items', 'is_read', 'integer not null default 0');
  addColumnIfMissing(sqlite, 'mail_items', 'importance', "text not null default 'normal'");
  addColumnIfMissing(sqlite, 'mail_items', 'is_deleted', 'integer not null default 0');
  addColumnIfMissing(sqlite, 'mail_items', 'deleted_at', 'text');

  sqlite.transaction(() => {
    sqlite.exec(`
      create table mail_items_v2 (
        id text primary key,
        external_id text not null,
        message_id text not null,
        conversation_id text not null,
        provider text not null,
        subject text not null,
        sender text not null,
        from_name text not null,
        from_address text not null,
        received_at text not null,
        snippet text not null,
        body_preview text not null,
        body_text text not null,
        report_status text not null,
        report_task_id text,
        is_read integer not null,
        importance text not null,
        is_deleted integer not null,
        deleted_at text,
        created_at text not null,
        updated_at text not null
      );

      insert into mail_items_v2 (
        id, external_id, message_id, conversation_id, provider, subject, sender, from_name, from_address,
        received_at, snippet, body_preview, body_text, report_status, report_task_id, is_read, importance,
        is_deleted, deleted_at, created_at, updated_at
      )
      select
        id, external_id, case when message_id = '' then external_id else message_id end, conversation_id,
        provider, subject, sender, from_name, from_address, received_at, snippet, body_preview,
        case when body_text = '' then body_preview else body_text end,
        case when status = 'processed' then 'summarized' else 'pending' end, null,
        is_read, importance, is_deleted, deleted_at, created_at, updated_at
      from mail_items;

      drop table mail_items;
      alter table mail_items_v2 rename to mail_items;
    `);
  })();
};

const ensureTables = (sqlite: Database.Database): void => {
  sqlite.exec(`
    create table if not exists operation_records (
      id text primary key,
      task_type text not null,
      source text not null,
      input text not null,
      status text not null,
      started_at text not null,
      ended_at text not null,
      duration_ms integer not null,
      processed_count integer not null,
      error_message text
    );

    create table if not exists mail_items (
      id text primary key,
      external_id text not null,
      message_id text not null,
      conversation_id text not null,
      provider text not null,
      subject text not null,
      sender text not null,
      from_name text not null,
      from_address text not null,
      received_at text not null,
      snippet text not null,
      body_preview text not null,
      body_text text not null,
      report_status text not null,
      report_task_id text,
      is_read integer not null,
      importance text not null,
      is_deleted integer not null,
      deleted_at text,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists mail_attachments (
      id text primary key,
      mail_item_id text not null,
      external_id text not null,
      name text not null,
      content_type text not null,
      size integer not null
    );

    create table if not exists mail_sync_states (
      id text primary key,
      provider text not null,
      folder text not null,
      delta_link text,
      initial_window_days integer not null,
      last_synced_at text,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists oauth_tokens (
      provider text primary key,
      refresh_token text not null,
      scope text,
      expires_at text,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists report_tasks (
      id text primary key,
      source text not null,
      status text not null,
      claimed_at text not null,
      expires_at text not null,
      reported_at text,
      summary text,
      mail_count integer not null,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists report_task_mail_items (
      task_id text not null,
      mail_item_id text not null,
      message_id text not null,
      subject text not null,
      sender text not null,
      received_at text not null,
      primary key (task_id, mail_item_id)
    );
  `);

  migrateLegacyMailItems(sqlite);
  sqlite.exec(`
    create unique index if not exists mail_items_provider_external_id_idx on mail_items(provider, external_id);
    create index if not exists mail_items_report_pending_idx on mail_items(provider, report_status, is_deleted, received_at desc);
    create unique index if not exists mail_attachments_mail_external_id_idx on mail_attachments(mail_item_id, external_id);
    create unique index if not exists mail_sync_states_provider_folder_idx on mail_sync_states(provider, folder);
    create index if not exists report_tasks_status_expiry_idx on report_tasks(status, expires_at);
  `);
};

const mapAttachment = (row: AttachmentRow): MailAttachment => ({
  externalId: row.external_id,
  name: row.name,
  contentType: row.content_type,
  size: row.size
});

const mapMail = (row: MailRow, attachments: MailAttachment[]): MailItem => ({
  id: row.id,
  externalId: row.external_id,
  messageId: row.message_id || row.external_id,
  conversationId: row.conversation_id,
  provider: row.provider,
  subject: row.subject,
  sender: row.sender,
  fromName: row.from_name,
  fromAddress: row.from_address,
  receivedAt: fromIso(row.received_at),
  snippet: row.snippet,
  bodyPreview: row.body_preview,
  bodyText: row.body_text,
  attachments,
  isRead: Boolean(row.is_read),
  importance: row.importance as MailImportance,
  isDeleted: Boolean(row.is_deleted),
  deletedAt: fromNullableIso(row.deleted_at)
});

const mapReportTask = (row: ReportTaskRow): ReportTask => ({
  id: row.id,
  source: row.source,
  status: row.status as ReportTaskStatus,
  claimedAt: fromIso(row.claimed_at),
  expiresAt: fromIso(row.expires_at),
  reportedAt: fromNullableIso(row.reported_at),
  summary: row.summary,
  mailCount: row.mail_count,
  createdAt: fromIso(row.created_at),
  updatedAt: fromIso(row.updated_at)
});

export const createSqliteStorage = (input: CreateSqliteStorageInput): Storage => {
  mkdirSync(dirname(input.databasePath), { recursive: true });
  const sqlite = new Database(input.databasePath);
  ensureTables(sqlite);

  const getAttachments = (mailItemId: string): MailAttachment[] =>
    (sqlite.prepare('select external_id, name, content_type, size from mail_attachments where mail_item_id = ? order by name').all(mailItemId) as AttachmentRow[]).map(mapAttachment);

  const getMailById = (id: string): MailItem => {
    const row = sqlite.prepare('select * from mail_items where id = ?').get(id) as MailRow | undefined;
    if (!row) throw new Error(`Mail item not found: ${id}`);
    return mapMail(row, getAttachments(row.id));
  };

  return {
    async saveMailItems(items) {
      const now = toIso(new Date());
      const upsert = sqlite.prepare(`
        insert into mail_items (
          id, external_id, message_id, conversation_id, provider, subject, sender, from_name, from_address,
          received_at, snippet, body_preview, body_text, report_status, report_task_id, is_read, importance,
          is_deleted, deleted_at, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', null, ?, ?, ?, ?, ?, ?)
        on conflict(provider, external_id) do update set
          message_id = excluded.message_id,
          conversation_id = excluded.conversation_id,
          subject = excluded.subject,
          sender = excluded.sender,
          from_name = excluded.from_name,
          from_address = excluded.from_address,
          received_at = excluded.received_at,
          snippet = excluded.snippet,
          body_preview = excluded.body_preview,
          body_text = excluded.body_text,
          is_read = excluded.is_read,
          importance = excluded.importance,
          is_deleted = excluded.is_deleted,
          deleted_at = excluded.deleted_at,
          updated_at = excluded.updated_at
      `);
      const find = sqlite.prepare('select * from mail_items where provider = ? and external_id = ?');
      const deleteAttachments = sqlite.prepare('delete from mail_attachments where mail_item_id = ?');
      const insertAttachment = sqlite.prepare(
        'insert into mail_attachments (id, mail_item_id, external_id, name, content_type, size) values (?, ?, ?, ?, ?, ?)'
      );

      const saveAll = sqlite.transaction((mailItems: MailItem[]) => {
        const saved: MailItem[] = [];
        for (const item of mailItems) {
          upsert.run(
            item.id ?? randomUUID(), item.externalId, item.messageId, item.conversationId, item.provider, item.subject,
            item.sender, item.fromName, item.fromAddress, toIso(item.receivedAt), item.snippet, item.bodyPreview,
            item.bodyText, item.isRead ? 1 : 0, item.importance, item.isDeleted ? 1 : 0,
            item.deletedAt ? toIso(item.deletedAt) : null, now, now
          );
          const row = find.get(item.provider, item.externalId) as MailRow;
          deleteAttachments.run(row.id);
          for (const attachment of item.attachments) {
            insertAttachment.run(randomUUID(), row.id, attachment.externalId, attachment.name, attachment.contentType, attachment.size);
          }
          saved.push(mapMail(row, item.attachments));
        }
        return saved;
      });

      return saveAll(items);
    },

    async markMailItemsDeleted(input) {
      if (!input.messageIds.length) return;
      const placeholders = input.messageIds.map(() => '?').join(', ');
      sqlite
        .prepare(`update mail_items set is_deleted = 1, deleted_at = ?, updated_at = ? where provider = ? and message_id in (${placeholders})`)
        .run(toIso(new Date()), toIso(new Date()), input.provider, ...input.messageIds);
    },

    async listPendingMails(query = {}) {
      const source = query.source ?? null;
      const limit = query.limit ?? 50;
      const rows = (source
        ? sqlite.prepare('select * from mail_items where provider = ? and report_status = ? and is_deleted = 0 order by received_at desc limit ?').all(source, 'pending', limit)
        : sqlite.prepare('select * from mail_items where report_status = ? and is_deleted = 0 order by received_at desc limit ?').all('pending', limit)) as MailRow[];
      return rows.map((row) => mapMail(row, getAttachments(row.id)));
    },

    async getMailSyncState(input) {
      const row = sqlite.prepare('select * from mail_sync_states where provider = ? and folder = ?').get(input.provider, input.folder) as
        | { id: string; provider: string; folder: string; delta_link: string | null; initial_window_days: number; last_synced_at: string | null; created_at: string; updated_at: string }
        | undefined;
      return row
        ? { id: row.id, provider: row.provider, folder: row.folder, deltaLink: row.delta_link, initialWindowDays: row.initial_window_days, lastSyncedAt: fromNullableIso(row.last_synced_at), createdAt: fromIso(row.created_at), updatedAt: fromIso(row.updated_at) }
        : null;
    },

    async upsertMailSyncState(input) {
      const existing = await this.getMailSyncState({ provider: input.provider, folder: input.folder });
      const now = new Date();
      sqlite.prepare(`
        insert into mail_sync_states (id, provider, folder, delta_link, initial_window_days, last_synced_at, created_at, updated_at)
        values (?, ?, ?, ?, ?, ?, ?, ?)
        on conflict(provider, folder) do update set delta_link = excluded.delta_link, initial_window_days = excluded.initial_window_days, last_synced_at = excluded.last_synced_at, updated_at = excluded.updated_at
      `).run(existing?.id ?? randomUUID(), input.provider, input.folder, input.deltaLink, input.initialWindowDays, toIso(input.lastSyncedAt), toIso(existing?.createdAt ?? now), toIso(now));
      return (await this.getMailSyncState({ provider: input.provider, folder: input.folder }))!;
    },

    async getOAuthToken(provider) {
      const row = sqlite.prepare('select * from oauth_tokens where provider = ?').get(provider) as
        | { provider: string; refresh_token: string; scope: string | null; expires_at: string | null; created_at: string; updated_at: string }
        | undefined;
      return row ? { provider: row.provider, refreshToken: row.refresh_token, scope: row.scope, expiresAt: fromNullableIso(row.expires_at), createdAt: fromIso(row.created_at), updatedAt: fromIso(row.updated_at) } : null;
    },

    async upsertOAuthToken(input) {
      const existing = await this.getOAuthToken(input.provider);
      const now = new Date();
      const expiresAt = input.expiresAt ?? existing?.expiresAt ?? null;
      const scope = input.scope ?? existing?.scope ?? null;
      sqlite.prepare(`
        insert into oauth_tokens (provider, refresh_token, scope, expires_at, created_at, updated_at) values (?, ?, ?, ?, ?, ?)
        on conflict(provider) do update set refresh_token = excluded.refresh_token, scope = excluded.scope, expires_at = excluded.expires_at, updated_at = excluded.updated_at
      `).run(input.provider, input.refreshToken, scope, expiresAt ? toIso(expiresAt) : null, toIso(existing?.createdAt ?? now), toIso(now));
      return (await this.getOAuthToken(input.provider))!;
    },

    async claimReportTask(input: ClaimReportTaskInput): Promise<ClaimReportTaskResult> {
      const claim = sqlite.transaction((claimInput: ClaimReportTaskInput): ClaimReportTaskResult => {
        const now = toIso(claimInput.now);
        const expiredRows = sqlite.prepare("select id from report_tasks where status = 'claimed' and expires_at <= ?").all(now) as Array<{ id: string }>;
        for (const expired of expiredRows) {
          sqlite.prepare("update report_tasks set status = 'expired', updated_at = ? where id = ?").run(now, expired.id);
          sqlite.prepare("update mail_items set report_status = 'pending', report_task_id = null, updated_at = ? where report_task_id = ? and report_status = 'processing'").run(now, expired.id);
        }

        const selected = sqlite.prepare("select * from mail_items where provider = ? and report_status = 'pending' and is_deleted = 0 order by received_at desc limit ?").all(claimInput.source, claimInput.limit) as MailRow[];
        if (!selected.length) return { task: null, mails: [], expiredTaskCount: expiredRows.length };

        const taskId = randomUUID();
        const expiresAt = toIso(claimInput.expiresAt);
        sqlite.prepare('insert into report_tasks (id, source, status, claimed_at, expires_at, reported_at, summary, mail_count, created_at, updated_at) values (?, ?, ?, ?, ?, null, null, ?, ?, ?)')
          .run(taskId, claimInput.source, 'claimed', now, expiresAt, selected.length, now, now);
        const updateMail = sqlite.prepare("update mail_items set report_status = 'processing', report_task_id = ?, updated_at = ? where id = ?");
        const saveLink = sqlite.prepare('insert into report_task_mail_items (task_id, mail_item_id, message_id, subject, sender, received_at) values (?, ?, ?, ?, ?, ?)');
        for (const row of selected) {
          updateMail.run(taskId, now, row.id);
          saveLink.run(taskId, row.id, row.message_id, row.subject, row.sender, row.received_at);
        }
        const task = sqlite.prepare('select * from report_tasks where id = ?').get(taskId) as ReportTaskRow;
        return { task: mapReportTask(task), mails: selected.map((row) => getMailById(row.id)), expiredTaskCount: expiredRows.length };
      });
      return claim(input);
    },

    async submitReportTask(input: SubmitReportTaskInput) {
      const submit = sqlite.transaction((submission: SubmitReportTaskInput): ReportTask => {
        const row = sqlite.prepare('select * from report_tasks where id = ?').get(submission.taskId) as ReportTaskRow | undefined;
        if (!row) throw new Error('Report task not found');
        if (row.status === 'completed') return mapReportTask(row);
        if (row.status === 'expired' || row.expires_at <= toIso(submission.now)) throw new Error('Report task has expired');
        if (row.status !== 'claimed') throw new Error(`Report task is not claimable: ${row.status}`);

        const now = toIso(submission.now);
        sqlite.prepare("update report_tasks set status = 'completed', reported_at = ?, summary = ?, updated_at = ? where id = ?").run(now, submission.summary, now, submission.taskId);
        sqlite.prepare("update mail_items set report_status = 'summarized', updated_at = ? where report_task_id = ? and report_status = 'processing'").run(now, submission.taskId);
        return mapReportTask(sqlite.prepare('select * from report_tasks where id = ?').get(submission.taskId) as ReportTaskRow);
      });
      return submit(input);
    },

    async recordOperation(operation) {
      const id = randomUUID();
      sqlite.prepare('insert into operation_records (id, task_type, source, input, status, started_at, ended_at, duration_ms, processed_count, error_message) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, operation.taskType, operation.source, JSON.stringify(operation.input), operation.status, toIso(operation.startedAt), toIso(operation.endedAt), operation.durationMs, operation.processedCount, operation.errorMessage);
      return { ...operation, id };
    },

    async listOperations(query = {}) {
      const rows = sqlite.prepare('select * from operation_records order by started_at desc limit ?').all(query.limit ?? 20) as Array<{
        id: string; task_type: string; source: string; input: string; status: string; started_at: string; ended_at: string; duration_ms: number; processed_count: number; error_message: string | null;
      }>;
      return rows.map((row) => ({
        id: row.id,
        taskType: row.task_type as TaskType,
        source: row.source,
        input: JSON.parse(row.input) as unknown,
        status: row.status as OperationStatus,
        startedAt: fromIso(row.started_at),
        endedAt: fromIso(row.ended_at),
        durationMs: row.duration_ms,
        processedCount: row.processed_count,
        errorMessage: row.error_message
      }));
    },

    close() {
      sqlite.close();
    }
  };
};
