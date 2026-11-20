import type { SQLiteDatabase } from 'expo-sqlite';

import { newUid } from '../lib/uid';
import { ITEM_COLORS } from '../theme';

const DATABASE_VERSION = 3;

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

  if (version === 1) {
    // v1.2: sync ids, who-added-it, upload queue (dirty), money entries, per-phone settings.
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        ALTER TABLE orders ADD COLUMN uid TEXT;
        ALTER TABLE orders ADD COLUMN created_by TEXT NOT NULL DEFAULT '';
        ALTER TABLE orders ADD COLUMN dirty INTEGER NOT NULL DEFAULT 1;
        ALTER TABLE order_items ADD COLUMN menu_item_uid TEXT;
        ALTER TABLE menu_items ADD COLUMN uid TEXT;
        ALTER TABLE menu_items ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE menu_items ADD COLUMN deleted INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE menu_items ADD COLUMN dirty INTEGER NOT NULL DEFAULT 1;
        CREATE TABLE IF NOT EXISTS money_entries (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          uid TEXT,
          kind TEXT NOT NULL CHECK (kind IN ('expense', 'in', 'out')),
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL,
          category TEXT,
          amount INTEGER NOT NULL CHECK (amount >= 0),
          method TEXT NOT NULL CHECK (method IN ('cash', 'bank')),
          note TEXT NOT NULL DEFAULT '',
          created_by TEXT NOT NULL DEFAULT '',
          updated_by TEXT NOT NULL DEFAULT '',
          deleted INTEGER NOT NULL DEFAULT 0,
          dirty INTEGER NOT NULL DEFAULT 1
        );
        CREATE INDEX IF NOT EXISTS idx_money_created ON money_entries (created_at);
        CREATE TABLE IF NOT EXISTS device_settings (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
        );
      `);
      await backfillUids(db);
      await db.execAsync(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_uid ON orders (uid);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_menu_uid ON menu_items (uid);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_money_uid ON money_entries (uid);
      `);
      await db.runAsync(
        "INSERT OR IGNORE INTO device_settings (key, value) VALUES ('device_id', ?), ('settings_dirty', '1')",
        newUid(),
      );
    });
    version = 2;
  }

  if (version === 2) {
    // v1.4: who last changed an order or menu item (money entries already had updated_by).
    await db.withTransactionAsync(async () => {
      await db.execAsync(`
        ALTER TABLE orders ADD COLUMN updated_by TEXT NOT NULL DEFAULT '';
        UPDATE orders SET updated_by = created_by;
        ALTER TABLE menu_items ADD COLUMN updated_by TEXT NOT NULL DEFAULT '';
      `);
    });
    version = 3;
  }

  // Future schema changes go here: if (version === 3) { ...; version = 4; }

  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}

/** Gives every synced row a uid (used after migration and after restoring an old backup). */
export async function backfillUids(db: SQLiteDatabase): Promise<void> {
  for (const table of ['orders', 'menu_items', 'money_entries'] as const) {
    const rows = await db.getAllAsync<{ id: number }>(`SELECT id FROM ${table} WHERE uid IS NULL`);
    for (const r of rows) {
      await db.runAsync(`UPDATE ${table} SET uid = ? WHERE id = ?`, newUid(), r.id);
    }
  }
  await db.execAsync(`
    UPDATE order_items
    SET menu_item_uid = (SELECT m.uid FROM menu_items m WHERE m.id = order_items.menu_item_id)
    WHERE menu_item_uid IS NULL AND menu_item_id IS NOT NULL;
  `);
}
