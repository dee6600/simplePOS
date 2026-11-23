import type { SQLiteDatabase } from 'expo-sqlite';

import type { Range } from '../lib/dates';
import { formatQty } from '../lib/stock';
import type { Method, StockEntry, StockGroup, StockItem, StockKind } from '../lib/types';
import { newUid } from '../lib/uid';
import { CURRENT_USER_SQL } from './settings';
import { withTx } from './tx';

// ---- Items ----

const ITEM_COLUMNS = 'id, uid, name, unit, grp, sort_order, active, low_level, expense_category';

/** includeDeleted: also deleted items, so old entries can still show their name. */
export async function listStockItems(
  db: SQLiteDatabase, opts: { activeOnly?: boolean; includeDeleted?: boolean } = {},
): Promise<StockItem[]> {
  const where = opts.includeDeleted ? '' : opts.activeOnly ? 'WHERE deleted = 0 AND active = 1' : 'WHERE deleted = 0';
  return db.getAllAsync<StockItem>(`SELECT ${ITEM_COLUMNS} FROM stock_items ${where} ORDER BY sort_order, id`);
}

export type StockItemInput = {
  name: string;
  unit: string;
  grp: StockGroup;
  active: boolean;
  low_level: number | null;
  expense_category: string | null;
};

export async function addStockItem(db: SQLiteDatabase, input: StockItemInput): Promise<void> {
  await db.runAsync(
    `INSERT INTO stock_items (uid, name, unit, grp, active, low_level, expense_category, updated_at, updated_by, dirty, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ${CURRENT_USER_SQL}, 1, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM stock_items))`,
    newUid(), input.name.trim(), input.unit, input.grp, input.active ? 1 : 0, input.low_level, input.expense_category,
    Date.now(),
  );
}

export async function updateStockItem(db: SQLiteDatabase, id: number, input: StockItemInput): Promise<void> {
  await db.runAsync(
    `UPDATE stock_items SET name = ?, unit = ?, grp = ?, active = ?, low_level = ?, expense_category = ?, updated_at = ?,
       updated_by = ${CURRENT_USER_SQL}, dirty = 1
     WHERE id = ?`,
    input.name.trim(), input.unit, input.grp, input.active ? 1 : 0, input.low_level, input.expense_category, Date.now(), id,
  );
}

/** Soft delete, so it reaches the other phones. Past entries stay (and still count in old summaries). */
export async function deleteStockItem(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync(
    `UPDATE stock_items SET deleted = 1, updated_at = ?, updated_by = ${CURRENT_USER_SQL}, dirty = 1 WHERE id = ?`,
    Date.now(), id,
  );
}

// ---- Entries ----

const ENTRY_SELECT = `
  SELECT s.id, s.uid, s.item_uid, s.kind, s.qty, s.money_uid, s.note, s.created_at, s.updated_at,
         s.created_by, s.updated_by, s.deleted,
         m.amount AS paid_amount, m.method AS paid_method
  FROM stock_entries s
  LEFT JOIN money_entries m ON m.uid = s.money_uid AND m.deleted = 0`;

/** Non-deleted entries within `range`, newest first, with what was paid (if an expense was saved with it). */
export async function listStockEntries(db: SQLiteDatabase, range: Range): Promise<StockEntry[]> {
  return db.getAllAsync<StockEntry>(
    `${ENTRY_SELECT} WHERE s.deleted = 0 AND s.created_at >= ? AND s.created_at < ? ORDER BY s.created_at DESC, s.id DESC`,
    range.start, range.end,
  );
}

/** All-time bought − sent per item: what is in stock now (used for the "kept at home" items). */
export async function getStockLevels(db: SQLiteDatabase): Promise<Map<string, number>> {
  const rows = await db.getAllAsync<{ item_uid: string; level: number }>(`
    SELECT item_uid, COALESCE(SUM(CASE kind WHEN 'in' THEN qty WHEN 'out' THEN -qty ELSE 0 END), 0) AS level
    FROM stock_entries WHERE deleted = 0 GROUP BY item_uid
  `);
  return new Map(rows.map((r) => [r.item_uid, Math.round(r.level * 1000) / 1000]));
}

export type StockEntryInput = {
  kind: StockKind;
  qty: number;
  note: string;
  /** Also save (or update) an expense for this purchase. Only for 'in' entries of items that aren't cooked. */
  paid: { amount: number; method: Method } | null;
};

function expenseNote(item: StockItem, input: StockEntryInput): string {
  const base = `${formatQty(input.qty, item.unit)} ${item.name}`;
  return input.note.trim() ? `${base} · ${input.note.trim()}` : base;
}

async function insertExpense(db: SQLiteDatabase, item: StockItem, input: StockEntryInput, at: number): Promise<string> {
  const uid = newUid();
  await db.runAsync(
    `INSERT INTO money_entries
       (uid, kind, created_at, updated_at, category, amount, method, note, created_by, updated_by, dirty)
     VALUES (?, 'expense', ?, ?, ?, ?, ?, ?, ${CURRENT_USER_SQL}, ${CURRENT_USER_SQL}, 1)`,
    uid, at, Date.now(), item.expense_category || 'Other', input.paid!.amount, input.paid!.method, expenseNote(item, input),
  );
  return uid;
}

const canPay = (item: StockItem, kind: StockKind) => kind === 'in' && item.grp !== 'cooked';

/** `at`: when it happened (default now), e.g. the end of yesterday when last night's leftover is added late. */
export async function addStockEntry(
  db: SQLiteDatabase, item: StockItem, input: StockEntryInput, at: number = Date.now(),
): Promise<void> {
  const now = Date.now();
  await withTx(db, async () => {
    const moneyUid = input.paid && canPay(item, input.kind) ? await insertExpense(db, item, input, at) : null;
    await db.runAsync(
      `INSERT INTO stock_entries
         (uid, item_uid, kind, qty, money_uid, note, created_at, updated_at, created_by, updated_by, dirty)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ${CURRENT_USER_SQL}, ${CURRENT_USER_SQL}, 1)`,
      newUid(), item.uid, input.kind, input.qty, moneyUid, input.note.trim(), at, now,
    );
  });
}

/** Updates the entry and keeps its expense in step: added, changed, or deleted when "paid" is cleared. */
export async function updateStockEntry(
  db: SQLiteDatabase, entry: StockEntry, item: StockItem, input: StockEntryInput,
): Promise<void> {
  const now = Date.now();
  await withTx(db, async () => {
    let moneyUid = entry.money_uid;
    const paid = input.paid && canPay(item, input.kind) ? input.paid : null;
    const linked = moneyUid
      ? await db.getFirstAsync<{ id: number }>('SELECT id FROM money_entries WHERE uid = ? AND deleted = 0', moneyUid)
      : null;
    if (paid && linked) {
      await db.runAsync(
        `UPDATE money_entries SET amount = ?, method = ?, note = ?, updated_at = ?, updated_by = ${CURRENT_USER_SQL}, dirty = 1
         WHERE id = ?`,
        paid.amount, paid.method, expenseNote(item, input), now, linked.id,
      );
    } else if (paid) {
      moneyUid = await insertExpense(db, item, input, entry.created_at);
    } else if (linked) {
      await db.runAsync(
        `UPDATE money_entries SET deleted = 1, updated_at = ?, updated_by = ${CURRENT_USER_SQL}, dirty = 1 WHERE id = ?`,
        now, linked.id,
      );
      moneyUid = null;
    }
    await db.runAsync(
      `UPDATE stock_entries SET kind = ?, qty = ?, note = ?, money_uid = ?, updated_at = ?,
         updated_by = ${CURRENT_USER_SQL}, dirty = 1
       WHERE id = ?`,
      input.kind, input.qty, input.note.trim(), moneyUid, now, entry.id,
    );
  });
}

/** Deletes (or restores, for UNDO) the entry together with the expense saved with it. */
export async function setStockEntryDeleted(db: SQLiteDatabase, entry: StockEntry, deleted: boolean): Promise<void> {
  const now = Date.now();
  await withTx(db, async () => {
    await db.runAsync(
      `UPDATE stock_entries SET deleted = ?, updated_at = ?, updated_by = ${CURRENT_USER_SQL}, dirty = 1 WHERE id = ?`,
      deleted ? 1 : 0, now, entry.id,
    );
    if (entry.money_uid && entry.paid_amount != null) {
      await db.runAsync(
        `UPDATE money_entries SET deleted = ?, updated_at = ?, updated_by = ${CURRENT_USER_SQL}, dirty = 1 WHERE uid = ?`,
        deleted ? 1 : 0, now, entry.money_uid,
      );
    }
  });
}
