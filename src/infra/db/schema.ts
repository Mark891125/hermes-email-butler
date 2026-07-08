import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const operationRecords = sqliteTable('operation_records', {
  id: text('id').primaryKey(),
  taskType: text('task_type').notNull(),
  source: text('source').notNull(),
  input: text('input').notNull(),
  status: text('status').notNull(),
  startedAt: text('started_at').notNull(),
  endedAt: text('ended_at').notNull(),
  durationMs: integer('duration_ms').notNull(),
  processedCount: integer('processed_count').notNull(),
  errorMessage: text('error_message')
});

export const mailItems = sqliteTable('mail_items', {
  id: text('id').primaryKey(),
  externalId: text('external_id').notNull(),
  provider: text('provider').notNull(),
  subject: text('subject').notNull(),
  sender: text('sender').notNull(),
  receivedAt: text('received_at').notNull(),
  snippet: text('snippet').notNull(),
  status: text('status').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
});

export const reports = sqliteTable('reports', {
  id: text('id').primaryKey(),
  source: text('source').notNull(),
  title: text('title').notNull(),
  summary: text('summary').notNull(),
  content: text('content').notNull(),
  mailCount: integer('mail_count').notNull(),
  createdAt: text('created_at').notNull()
});
