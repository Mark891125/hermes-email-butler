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
  messageId: text('message_id').notNull(),
  conversationId: text('conversation_id').notNull(),
  provider: text('provider').notNull(),
  subject: text('subject').notNull(),
  sender: text('sender').notNull(),
  fromName: text('from_name').notNull(),
  fromAddress: text('from_address').notNull(),
  receivedAt: text('received_at').notNull(),
  snippet: text('snippet').notNull(),
  bodyPreview: text('body_preview').notNull(),
  bodyText: text('body_text').notNull(),
  reportStatus: text('report_status').notNull(),
  reportTaskId: text('report_task_id'),
  isRead: integer('is_read', { mode: 'boolean' }).notNull(),
  importance: text('importance').notNull(),
  isDeleted: integer('is_deleted', { mode: 'boolean' }).notNull(),
  deletedAt: text('deleted_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
});

export const mailAttachments = sqliteTable('mail_attachments', {
  id: text('id').primaryKey(),
  mailItemId: text('mail_item_id').notNull(),
  externalId: text('external_id').notNull(),
  name: text('name').notNull(),
  contentType: text('content_type').notNull(),
  size: integer('size').notNull()
});

export const reportTasks = sqliteTable('report_tasks', {
  id: text('id').primaryKey(),
  source: text('source').notNull(),
  status: text('status').notNull(),
  claimedAt: text('claimed_at').notNull(),
  expiresAt: text('expires_at').notNull(),
  reportedAt: text('reported_at'),
  summary: text('summary'),
  mailCount: integer('mail_count').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
});

export const reportTaskMailItems = sqliteTable('report_task_mail_items', {
  taskId: text('task_id').notNull(),
  mailItemId: text('mail_item_id').notNull(),
  messageId: text('message_id').notNull(),
  subject: text('subject').notNull(),
  sender: text('sender').notNull(),
  receivedAt: text('received_at').notNull()
});

export const mailSyncStates = sqliteTable('mail_sync_states', {
  id: text('id').primaryKey(),
  provider: text('provider').notNull(),
  folder: text('folder').notNull(),
  deltaLink: text('delta_link'),
  initialWindowDays: integer('initial_window_days').notNull(),
  lastSyncedAt: text('last_synced_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
});

export const oauthTokens = sqliteTable('oauth_tokens', {
  provider: text('provider').primaryKey(),
  refreshToken: text('refresh_token').notNull(),
  scope: text('scope'),
  expiresAt: text('expires_at'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
});
