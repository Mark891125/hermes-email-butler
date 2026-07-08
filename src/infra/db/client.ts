import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

import Database from 'better-sqlite3';
import { desc, eq, inArray } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/better-sqlite3';

import type { MailItem, MailStatus } from '../../ports/mail-provider.js';
import type { OperationRecord, OperationStatus, SavedReport, SaveReportInput, Storage, TaskType } from '../../ports/storage.js';
import { mailItems, operationRecords, reports } from './schema.js';

interface CreateSqliteStorageInput {
  databasePath: string;
}

const toIso = (date: Date): string => date.toISOString();
const fromIso = (value: string): Date => new Date(value);

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
      provider text not null,
      subject text not null,
      sender text not null,
      received_at text not null,
      snippet text not null,
      status text not null,
      created_at text not null,
      updated_at text not null
    );

    create unique index if not exists mail_items_provider_external_id_idx
      on mail_items(provider, external_id);

    create table if not exists reports (
      id text primary key,
      source text not null,
      title text not null,
      summary text not null,
      content text not null,
      mail_count integer not null,
      created_at text not null
    );
  `);
};

const mapMail = (row: typeof mailItems.$inferSelect): MailItem => ({
  id: row.id,
  externalId: row.externalId,
  provider: row.provider,
  subject: row.subject,
  sender: row.sender,
  receivedAt: fromIso(row.receivedAt),
  snippet: row.snippet,
  status: row.status as MailStatus
});

const mapReport = (row: typeof reports.$inferSelect): SavedReport => ({
  id: row.id,
  source: row.source,
  title: row.title,
  summary: row.summary,
  content: row.content,
  mailCount: row.mailCount,
  createdAt: fromIso(row.createdAt)
});

const mapOperation = (row: typeof operationRecords.$inferSelect): OperationRecord => ({
  id: row.id,
  taskType: row.taskType as TaskType,
  source: row.source,
  input: JSON.parse(row.input) as unknown,
  status: row.status as OperationStatus,
  startedAt: fromIso(row.startedAt),
  endedAt: fromIso(row.endedAt),
  durationMs: row.durationMs,
  processedCount: row.processedCount,
  errorMessage: row.errorMessage
});

export const createSqliteStorage = (input: CreateSqliteStorageInput): Storage => {
  mkdirSync(dirname(input.databasePath), { recursive: true });

  const sqlite = new Database(input.databasePath);
  ensureTables(sqlite);
  const db = drizzle(sqlite);

  return {
    async saveMailItems(items) {
      const now = toIso(new Date());
      const saved: MailItem[] = [];

      for (const item of items) {
        const id = item.id ?? randomUUID();
        db.insert(mailItems)
          .values({
            id,
            externalId: item.externalId,
            provider: item.provider,
            subject: item.subject,
            sender: item.sender,
            receivedAt: toIso(item.receivedAt),
            snippet: item.snippet,
            status: item.status,
            createdAt: now,
            updatedAt: now
          })
          .onConflictDoUpdate({
            target: [mailItems.provider, mailItems.externalId],
            set: {
              subject: item.subject,
              sender: item.sender,
              receivedAt: toIso(item.receivedAt),
              snippet: item.snippet,
              status: item.status,
              updatedAt: now
            }
          })
          .run();
        saved.push({ ...item, id });
      }

      return saved;
    },

    async listPendingMails(query = {}) {
      const limit = query.limit ?? 50;
      const rows = query.source
        ? db.select().from(mailItems).where(eq(mailItems.provider, query.source)).orderBy(desc(mailItems.receivedAt)).limit(limit).all()
        : db.select().from(mailItems).orderBy(desc(mailItems.receivedAt)).limit(limit).all();

      return rows.filter((row) => row.status === 'pending').map(mapMail);
    },

    async markMailsProcessed(ids) {
      if (ids.length === 0) {
        return;
      }

      db.update(mailItems)
        .set({ status: 'processed', updatedAt: toIso(new Date()) })
        .where(inArray(mailItems.id, ids))
        .run();
    },

    async saveReport(report: SaveReportInput) {
      const row = {
        id: randomUUID(),
        source: report.source,
        title: report.title,
        summary: report.summary,
        content: report.content,
        mailCount: report.mailCount,
        createdAt: toIso(new Date())
      };

      db.insert(reports).values(row).run();
      return mapReport(row);
    },

    async getLatestReport() {
      const row = db.select().from(reports).orderBy(desc(reports.createdAt)).limit(1).get();
      return row ? mapReport(row) : null;
    },

    async recordOperation(operation) {
      const row = {
        id: randomUUID(),
        taskType: operation.taskType,
        source: operation.source,
        input: JSON.stringify(operation.input),
        status: operation.status,
        startedAt: toIso(operation.startedAt),
        endedAt: toIso(operation.endedAt),
        durationMs: operation.durationMs,
        processedCount: operation.processedCount,
        errorMessage: operation.errorMessage
      };

      db.insert(operationRecords).values(row).run();
      return mapOperation(row);
    },

    async listOperations(query = {}) {
      const rows = db.select().from(operationRecords).orderBy(desc(operationRecords.startedAt)).limit(query.limit ?? 20).all();
      return rows.map(mapOperation);
    },

    close() {
      sqlite.close();
    }
  };
};
