import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';

import { dayKey } from '../lib/dates';
import { backfillUids, seedStockItems } from './migrate';
import { setDeviceSetting } from './settings';
import { withTx } from './tx';

type Row = Record<string, string | number | null>;

/**
 * Version 1 = app v1.0 (no money entries, no uids). Version 2 = app v1.2. Version 3 = app v1.5 (stock).
 * All can be restored.
 */
export type Backup = {
  app: 'simplepos';
  version: 1 | 2 | 3;
  exported_at: number;
  menu_items: Row[];
  orders: Row[];
  order_items: Row[];
  settings: Row[];
  money_entries?: Row[];
  stock_items?: Row[];
  stock_entries?: Row[];
};

const TABLES = {
  menu_items: ['id', 'uid', 'name', 'price', 'color', 'sort_order', 'active', 'updated_at', 'deleted', 'updated_by'],
  orders: [
    'id', 'uid', 'order_no', 'created_at', 'updated_at', 'status', 'order_type', 'total', 'deleted', 'created_by',
    'updated_by',
  ],
  order_items: ['id', 'order_id', 'menu_item_id', 'menu_item_uid', 'name', 'price', 'qty'],
  settings: ['key', 'value'],
  money_entries: [
    'id', 'uid', 'kind', 'created_at', 'updated_at', 'category', 'amount', 'method', 'note', 'created_by', 'updated_by',
    'deleted',
  ],
  stock_items: [
    'id', 'uid', 'name', 'unit', 'grp', 'sort_order', 'active', 'low_level', 'expense_category', 'updated_at', 'updated_by',
    'deleted',
  ],
  stock_entries: [
    'id', 'uid', 'item_uid', 'kind', 'qty', 'money_uid', 'note', 'created_at', 'updated_at', 'created_by', 'updated_by',
    'deleted',
  ],
} as const;

type Table = keyof typeof TABLES;
const TABLE_NAMES = Object.keys(TABLES) as Table[];
const REQUIRED: Table[] = ['menu_items', 'orders', 'order_items', 'settings'];

/** Reads every table into a backup object. */
export async function buildBackup(db: SQLiteDatabase): Promise<Backup> {
  const data: Backup = {
    app: 'simplepos',
    version: 3,
    exported_at: Date.now(),
    menu_items: [],
    orders: [],
    order_items: [],
    settings: [],
    money_entries: [],
    stock_items: [],
    stock_entries: [],
  };
  for (const t of TABLE_NAMES) {
    data[t] = await db.getAllAsync<Row>(`SELECT ${TABLES[t].join(', ')} FROM ${t}`);
  }
  return data;
}

/** Writes every table to a JSON file and opens the share sheet (WhatsApp, Drive, Files…). */
export async function exportBackup(db: SQLiteDatabase): Promise<void> {
  const data = await buildBackup(db);
  const file = new File(Paths.cache, `simplepos-backup-${dayKey(Date.now())}.json`);
  file.create({ overwrite: true });
  await file.write(JSON.stringify(data));

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device.');
  }
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    UTI: 'public.json',
    dialogTitle: 'Save SimplePOS backup',
  });
}

export function parseBackup(text: string): Backup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file is not a SimplePOS backup.');
  }
  const b = data as Partial<Backup>;
  if (b?.app !== 'simplepos' || !REQUIRED.every((t) => Array.isArray(b[t]))) {
    throw new Error('This file is not a SimplePOS backup.');
  }
  return b as Backup;
}

/** Lets the user pick a backup file. Returns null if they cancel; throws if the file is not a valid backup. */
export async function pickBackup(): Promise<Backup | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
  if (res.canceled) return null;
  return parseBackup(await new File(res.assets[0].uri).text());
}

/**
 * Replaces ALL data in the app with the backup's contents.
 * Old (v1) backups get uids, and their orders are marked "Imported".
 * Everything restored is queued for upload in case this phone connects to family sync afterwards.
 */
export async function restoreBackup(db: SQLiteDatabase, data: Backup): Promise<void> {
  const defaults: Row = {
    created_by: data.version === 1 ? 'Imported' : '',
    updated_by: '',
    updated_at: 0,
    deleted: 0,
    note: '',
  };
  await withTx(db, async () => {
    // Children first because of the foreign key.
    await db.execAsync(`
      DELETE FROM order_items; DELETE FROM orders; DELETE FROM menu_items;
      DELETE FROM settings; DELETE FROM money_entries; DELETE FROM stock_entries; DELETE FROM stock_items;
    `);
    for (const t of TABLE_NAMES) {
      const cols = TABLES[t];
      const stmt = await db.prepareAsync(
        `INSERT INTO ${t} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
      );
      try {
        for (const row of data[t] ?? []) {
          await stmt.executeAsync(...cols.map((c) => row[c] ?? defaults[c] ?? null));
        }
      } finally {
        await stmt.finalizeAsync();
      }
    }
    await backfillUids(db);
    // Backups from before v1.5 have no stock list: start from the default one.
    if (!data.stock_items?.length) await seedStockItems(db);
    // Backups from before v1.4 don't say who last changed an order.
    await db.execAsync("UPDATE orders SET updated_by = created_by WHERE updated_by = '';");
    await db.execAsync(`
      UPDATE orders SET dirty = 1; UPDATE menu_items SET dirty = 1; UPDATE money_entries SET dirty = 1;
      UPDATE stock_entries SET dirty = 1; UPDATE stock_items SET dirty = CASE WHEN updated_at > 0 THEN 1 ELSE 0 END;
    `);
    await setDeviceSetting(db, 'settings_dirty', '1');
  });
}
