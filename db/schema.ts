import { integer, sqliteTable, text, primaryKey, index } from 'drizzle-orm/sqlite-core';
export const basket=sqliteTable('basket',{owner:text('owner').notNull(),product:text('product').notNull(),quantity:integer('quantity').notNull().default(1) },t=>[primaryKey({columns:[t.owner,t.product]})]);
export const saved=sqliteTable('saved',{owner:text('owner').notNull(),product:text('product').notNull()},t=>[primaryKey({columns:[t.owner,t.product]})]);
export const profiles=sqliteTable('profiles',{owner:text('owner').primaryKey(),data:text('data').notNull()});
export const requests=sqliteTable('requests',{id:text('id').primaryKey(),owner:text('owner').notNull(),kind:text('kind').notNull(),data:text('data').notNull(),status:text('status').notNull().default('Request received'),created:text('created').notNull()},t=>[index('requests_owner_created').on(t.owner,t.created)]);

// Keep these definitions aligned with 0002_launch_operations.sql. Authentication
// tables remain in auth-schema.ts; both schema files are included by drizzle-kit.
export const requestKeys = sqliteTable('request_keys', {
  owner: text('owner').notNull(),
  key: text('key').notNull(),
  requestId: text('request_id').notNull(),
  bodyHash: text('body_hash').notNull(),
  created: text('created').notNull(),
}, table => [primaryKey({ columns: [table.owner, table.key] })]);

export const requestLimits = sqliteTable('request_limits', {
  scope: text('scope').primaryKey().notNull(),
  attempts: integer('attempts').notNull().default(0),
  expires: integer('expires').notNull(),
}, table => [index('request_limits_expiry').on(table.expires)]);

export const requestVersions = sqliteTable('request_versions', {
  requestId: text('request_id').primaryKey().notNull().references(() => requests.id, { onDelete: 'cascade' }),
  version: integer('version').notNull().default(0),
  lastOperation: text('last_operation'),
});

export const requestUpdates = sqliteTable('request_updates', {
  id: text('id').primaryKey().notNull(),
  requestId: text('request_id').notNull().references(() => requests.id, { onDelete: 'cascade' }),
  actor: text('actor').notNull(),
  status: text('status').notNull(),
  message: text('message').notNull(),
  created: text('created').notNull(),
}, table => [index('request_updates_request_created').on(table.requestId, table.created)]);
