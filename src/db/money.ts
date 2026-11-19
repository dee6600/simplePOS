import type { SQLiteDatabase } from 'expo-sqlite';

import type { BalanceSums } from '../lib/balance';
import type { Range } from '../lib/dates';
import type { Method, MoneyEntry, MoneyKind } from '../lib/types';
import { newUid } from '../lib/uid';
import { CURRENT_USER_SQL } from './settings';

const COLUMNS = 'id, uid, kind, created_at, updated_at, category, amount, method, note, created_by, updated_by, deleted';

export type MoneyInput = {
  kind: MoneyKind;
  amount: number;
  method: Method;
  category: string | null;
  note: string;
};

export async function addMoneyEntry(db: SQLiteDatabase, input: MoneyInput): Promise<number> {
  const now = Date.now();
  const res = await db.runAsync(
    `INSERT INTO money_entries
       (uid, kind, created_at, updated_at, category, amount, method, note, created_by, updated_by, dirty)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ${CURRENT_USER_SQL}, ${CURRENT_USER_SQL}, 1)`,
    newUid(), input.kind, now, now, input.kind === 'expense' ? input.category : null,
    input.amount, input.method, input.note.trim(),
  );
  return res.lastInsertRowId;
}

export async function updateMoneyEntry(db: SQLiteDatabase, id: number, input: MoneyInput): Promise<void> {
  await db.runAsync(
    `UPDATE money_entries SET kind = ?, category = ?, amount = ?, method = ?, note = ?, updated_at = ?,
       updated_by = ${CURRENT_USER_SQL}, dirty = 1
     WHERE id = ?`,
    input.kind, input.kind === 'expense' ? input.category : null, input.amount, input.method, input.note.trim(),
    Date.now(), id,
  );
}

export async function setMoneyEntryDeleted(db: SQLiteDatabase, id: number, deleted: boolean): Promise<void> {
  await db.runAsync(
    `UPDATE money_entries SET deleted = ?, updated_at = ?, updated_by = ${CURRENT_USER_SQL}, dirty = 1 WHERE id = ?`,
    deleted ? 1 : 0, Date.now(), id,
  );
}

/** Non-deleted entries within `range`, newest first. */
export async function listMoneyEntries(db: SQLiteDatabase, range: Range): Promise<MoneyEntry[]> {
  return db.getAllAsync<MoneyEntry>(
    `SELECT ${COLUMNS} FROM money_entries
     WHERE deleted = 0 AND created_at >= ? AND created_at < ? ORDER BY created_at DESC, id DESC`,
    range.start, range.end,
  );
}

export async function getMoneyEntry(db: SQLiteDatabase, id: number): Promise<MoneyEntry | null> {
  return db.getFirstAsync<MoneyEntry>(`SELECT ${COLUMNS} FROM money_entries WHERE id = ?`, id);
}

/** All-time sums that make up the running Cash / Bank balance. */
export async function getBalanceSums(db: SQLiteDatabase): Promise<BalanceSums> {
  const orders = await db.getFirstAsync<{ cash: number; upi: number }>(`
    SELECT
      COALESCE(SUM(CASE WHEN status = 'cash' THEN total END), 0) AS cash,
      COALESCE(SUM(CASE WHEN status = 'upi' THEN total END), 0) AS upi
    FROM orders WHERE deleted = 0
  `);
  const money = await db.getAllAsync<{ kind: MoneyKind; method: Method; amount: number }>(`
    SELECT kind, method, COALESCE(SUM(amount), 0) AS amount
    FROM money_entries WHERE deleted = 0 GROUP BY kind, method
  `);
  const pick = (kind: MoneyKind, method: Method) =>
    money.find((m) => m.kind === kind && m.method === method)?.amount ?? 0;
  return {
    cashSales: orders?.cash ?? 0,
    upiSales: orders?.upi ?? 0,
    cashIn: pick('in', 'cash'),
    cashOut: pick('out', 'cash'),
    cashExpenses: pick('expense', 'cash'),
    bankIn: pick('in', 'bank'),
    bankOut: pick('out', 'bank'),
    bankExpenses: pick('expense', 'bank'),
  };
}
