import type { SQLiteDatabase } from 'expo-sqlite';

import { ITEM_COLORS } from '../theme';

const DATABASE_VERSION = 1;

/** Placeholder menu; names and prices are editable in Settings. */
export const DEFAULT_MENU: { name: string; price: number; color: string }[] = [
  { name: 'Chicken Biryani Half', price: 120, color: ITEM_COLORS[0] },
  { name: 'Chicken Biryani Full', price: 200, color: ITEM_COLORS[1] },
  { name: 'Mutton Biryani Half', price: 180, color: ITEM_COLORS[2] },
  { name: 'Mutton Biryani Full', price: 320, color: ITEM_COLORS[3] },
  { name: 'Chicken 65', price: 150, color: ITEM_COLORS[4] },
  { name: 'Water Bottle', price: 20, color: ITEM_COLORS[5] },
];

/** Runs from <SQLiteProvider onInit>, before any screen renders. */
export async function migrateDb(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA foreign_keys = ON;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  if (version >= DATABASE_VERSION) return;

  if (version === 0) {
    await db.execAsync(`
      PRAGMA journal_mode = 'wal';
      CREATE TABLE IF NOT EXISTS menu_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        price INTEGER NOT NULL,
        color TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        active INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_no INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'cash', 'upi')),
        order_type TEXT CHECK (order_type IN ('dine_in', 'parcel')),
        total INTEGER NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS idx_orders_created ON orders (created_at);
      CREATE TABLE IF NOT EXISTS order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id INTEGER NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
        menu_item_id INTEGER,
        name TEXT NOT NULL,
        price INTEGER NOT NULL,
        qty INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items (order_id);
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
    `);
    await db.withTransactionAsync(async () => {
      for (const [i, item] of DEFAULT_MENU.entries()) {
        await db.runAsync(
          'INSERT INTO menu_items (name, price, color, sort_order, active) VALUES (?, ?, ?, ?, 1)',
          item.name, item.price, item.color, i,
        );
      }
    });
    version = 1;
  }

  // Future schema changes go here: if (version === 1) { ...; version = 2; }

  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}
