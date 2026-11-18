import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';

import { dayKey } from '../lib/dates';

type Row = Record<string, string | number | null>;

export type Backup = {
  app: 'simplepos';
  version: 1;
  exported_at: number;
  menu_items: Row[];
  orders: Row[];
  order_items: Row[];
  settings: Row[];
};

const TABLES = {
  menu_items: ['id', 'name', 'price', 'color', 'sort_order', 'active'],
  orders: ['id', 'order_no', 'created_at', 'updated_at', 'status', 'order_type', 'total', 'deleted'],
  order_items: ['id', 'order_id', 'menu_item_id', 'name', 'price', 'qty'],
  settings: ['key', 'value'],
} as const;

type Table = keyof typeof TABLES;
const TABLE_NAMES = Object.keys(TABLES) as Table[];

/** Reads every table into a backup object. */
export async function buildBackup(db: SQLiteDatabase): Promise<Backup> {
  const data: Backup = {
    app: 'simplepos',
    version: 1,
    exported_at: Date.now(),
    menu_items: [],
    orders: [],
    order_items: [],
    settings: [],
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

/** Lets the user pick a backup file. Returns null if they cancel; throws if the file is not a valid backup. */
export async function pickBackup(): Promise<Backup | null> {
  const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
  if (res.canceled) return null;
  const text = await new File(res.assets[0].uri).text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('This file is not a SimplePOS backup.');
  }
  const b = data as Partial<Backup>;
  if (b?.app !== 'simplepos' || !TABLE_NAMES.every((t) => Array.isArray(b[t]))) {
    throw new Error('This file is not a SimplePOS backup.');
  }
  return b as Backup;
}

/** Replaces ALL data in the app with the backup's contents. */
export async function restoreBackup(db: SQLiteDatabase, data: Backup): Promise<void> {
  await db.withTransactionAsync(async () => {
    // Children first because of the foreign key.
    await db.execAsync('DELETE FROM order_items; DELETE FROM orders; DELETE FROM menu_items; DELETE FROM settings;');
    for (const t of TABLE_NAMES) {
      const cols = TABLES[t];
      const stmt = await db.prepareAsync(
        `INSERT INTO ${t} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`,
      );
      try {
        for (const row of data[t]) {
          await stmt.executeAsync(...cols.map((c) => row[c] ?? null));
        }
      } finally {
        await stmt.finalizeAsync();
      }
    }
  });
}
