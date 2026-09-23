import { integer, sqliteTable, text, primaryKey, index } from 'drizzle-orm/sqlite-core';
export const basket=sqliteTable('basket',{owner:text('owner').notNull(),product:text('product').notNull(),quantity:integer('quantity').notNull().default(1) },t=>[primaryKey({columns:[t.owner,t.product]})]);
export const saved=sqliteTable('saved',{owner:text('owner').notNull(),product:text('product').notNull()},t=>[primaryKey({columns:[t.owner,t.product]})]);
export const profiles=sqliteTable('profiles',{owner:text('owner').primaryKey(),data:text('data').notNull()});
export const requests=sqliteTable('requests',{id:text('id').primaryKey(),owner:text('owner').notNull(),kind:text('kind').notNull(),data:text('data').notNull(),status:text('status').notNull().default('Request received'),created:text('created').notNull()},t=>[index('requests_owner_created').on(t.owner,t.created)]);
