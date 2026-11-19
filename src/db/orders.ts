import type { SQLiteDatabase } from 'expo-sqlite';

import { periodRange, type Range } from '../lib/dates';
import { linesTotal } from '../lib/format';
import type { Order, OrderLine, OrderType, Status } from '../lib/types';
import { newUid } from '../lib/uid';
import { CURRENT_USER_SQL } from './settings';
import { withTx } from './tx';

type OrderRow = Omit<Order, 'items'>;
type ItemRow = OrderLine & { order_id: number };

const ORDER_COLUMNS = 'id, uid, order_no, created_at, updated_at, status, order_type, total, deleted, created_by';

export type OrderInput = {
  lines: OrderLine[];
  status: Status;
  orderType: OrderType;
};

async function insertLines(db: SQLiteDatabase, orderId: number, lines: OrderLine[]) {
  for (const l of lines) {
    if (l.qty <= 0) continue;
    await db.runAsync(
      `INSERT INTO order_items (order_id, menu_item_id, menu_item_uid, name, price, qty)
       VALUES (?, ?, (SELECT uid FROM menu_items WHERE id = ?), ?, ?, ?)`,
      orderId, l.menu_item_id, l.menu_item_id, l.name, l.price, l.qty,
    );
  }
}

/** Creates an order. Order numbers restart at 1 every day and are never reused that day, even after a delete. */
export async function createOrder(db: SQLiteDatabase, input: OrderInput): Promise<{ id: number; orderNo: number }> {
  const now = Date.now();
  const today = periodRange('day', new Date(now));
  let id = 0;
  let orderNo = 0;
  await withTx(db, async () => {
    const row = await db.getFirstAsync<{ n: number }>(
      'SELECT COALESCE(MAX(order_no), 0) + 1 AS n FROM orders WHERE created_at >= ? AND created_at < ?',
      today.start, today.end,
    );
    orderNo = row?.n ?? 1;
    const res = await db.runAsync(
      `INSERT INTO orders (uid, order_no, created_at, updated_at, status, order_type, total, created_by, dirty)
       VALUES (?, ?, ?, ?, ?, ?, ?, ${CURRENT_USER_SQL}, 1)`,
      newUid(), orderNo, now, now, input.status, input.orderType, linesTotal(input.lines),
    );
    id = res.lastInsertRowId;
    await insertLines(db, id, input.lines);
  });
  return { id, orderNo };
}

export async function updateOrder(db: SQLiteDatabase, id: number, input: OrderInput): Promise<void> {
  await withTx(db, async () => {
    await db.runAsync(
      'UPDATE orders SET status = ?, order_type = ?, total = ?, updated_at = ?, dirty = 1 WHERE id = ?',
      input.status, input.orderType, linesTotal(input.lines), Date.now(), id,
    );
    await db.runAsync('DELETE FROM order_items WHERE order_id = ?', id);
    await insertLines(db, id, input.lines);
  });
}

export async function setOrderStatus(db: SQLiteDatabase, id: number, status: Status): Promise<void> {
  await db.runAsync('UPDATE orders SET status = ?, updated_at = ?, dirty = 1 WHERE id = ?', status, Date.now(), id);
}

/** Soft delete so it can be undone (and so the delete can sync). Deleted orders are excluded everywhere. */
export async function setOrderDeleted(db: SQLiteDatabase, id: number, deleted: boolean): Promise<void> {
  await db.runAsync(
    'UPDATE orders SET deleted = ?, updated_at = ?, dirty = 1 WHERE id = ?', deleted ? 1 : 0, Date.now(), id,
  );
}

function attachItems(rows: OrderRow[], items: ItemRow[]): Order[] {
  const byOrder = new Map<number, OrderLine[]>();
  for (const it of items) {
    const list = byOrder.get(it.order_id) ?? [];
    list.push({ menu_item_id: it.menu_item_id, name: it.name, price: it.price, qty: it.qty });
    byOrder.set(it.order_id, list);
  }
  return rows.map((r) => ({ ...r, items: byOrder.get(r.id) ?? [] }));
}

/** Non-deleted orders created within `range`, newest first. */
export async function listOrders(db: SQLiteDatabase, range: Range): Promise<Order[]> {
  const where = 'deleted = 0 AND created_at >= ? AND created_at < ?';
  const rows = await db.getAllAsync<OrderRow>(
    `SELECT ${ORDER_COLUMNS} FROM orders WHERE ${where} ORDER BY created_at DESC, id DESC`, range.start, range.end,
  );
  const items = await db.getAllAsync<ItemRow>(
    `SELECT order_id, menu_item_id, name, price, qty FROM order_items
     WHERE order_id IN (SELECT id FROM orders WHERE ${where}) ORDER BY id`,
    range.start, range.end,
  );
  return attachItems(rows, items);
}

export async function getOrder(db: SQLiteDatabase, id: number): Promise<Order | null> {
  const row = await db.getFirstAsync<OrderRow>(`SELECT ${ORDER_COLUMNS} FROM orders WHERE id = ?`, id);
  if (!row) return null;
  const items = await db.getAllAsync<ItemRow>(
    'SELECT order_id, menu_item_id, name, price, qty FROM order_items WHERE order_id = ? ORDER BY id', id,
  );
  return attachItems([row], items)[0];
}
