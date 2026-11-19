/// <reference types="node" />
/**
 * Test helper: Node's built-in SQLite behind the subset of expo-sqlite's async API the app uses,
 * so tests run the app's real SQL.
 */
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

type Params = SQLInputValue[];
const norm = (p: unknown[]): Params => (p.length === 1 && Array.isArray(p[0]) ? p[0] : p) as Params;

export function openTestDb(): SQLiteDatabase {
  const raw = new DatabaseSync(':memory:');
  const db = {
    execAsync: async (sql: string) => raw.exec(sql),
    runAsync: async (sql: string, ...p: unknown[]) => {
      const r = raw.prepare(sql).run(...norm(p));
      return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    getFirstAsync: async (sql: string, ...p: unknown[]) => raw.prepare(sql).get(...norm(p)) ?? null,
    getAllAsync: async (sql: string, ...p: unknown[]) => raw.prepare(sql).all(...norm(p)),
    withTransactionAsync: async (task: () => Promise<void>) => {
      raw.exec('BEGIN');
      try {
        await task();
        raw.exec('COMMIT');
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
    prepareAsync: async (sql: string) => {
      const st = raw.prepare(sql);
      return { executeAsync: async (...p: unknown[]) => st.run(...norm(p)), finalizeAsync: async () => {} };
    },
  };
  return db as unknown as SQLiteDatabase;
}

/** The exact v1.0 schema (PRAGMA user_version = 1), to test upgrading a phone in place. */
export async function createV1Schema(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE menu_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, price INTEGER NOT NULL,
      color TEXT NOT NULL, sort_order INTEGER NOT NULL, active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT, order_no INTEGER NOT NULL, created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL, status TEXT NOT NULL CHECK (status IN ('pending', 'cash', 'upi')),
      order_type TEXT CHECK (order_type IN ('dine_in', 'parcel')), total INTEGER NOT NULL,
      deleted INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX idx_orders_created ON orders (created_at);
    CREATE TABLE order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
      menu_item_id INTEGER, name TEXT NOT NULL, price INTEGER NOT NULL, qty INTEGER NOT NULL
    );
    CREATE INDEX idx_order_items_order ON order_items (order_id);
    CREATE TABLE settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
    PRAGMA user_version = 1;
  `);
}
