import type { SQLiteDatabase } from 'expo-sqlite';

import type { MenuItem } from '../lib/types';
import { newUid } from '../lib/uid';
import { withTx } from './tx';

const COLUMNS = 'id, uid, name, price, color, sort_order, active';

export async function listMenu(db: SQLiteDatabase, opts: { activeOnly?: boolean } = {}): Promise<MenuItem[]> {
  const where = opts.activeOnly ? 'WHERE deleted = 0 AND active = 1' : 'WHERE deleted = 0';
  return db.getAllAsync<MenuItem>(`SELECT ${COLUMNS} FROM menu_items ${where} ORDER BY sort_order, id`);
}

export type MenuItemInput = { name: string; price: number; color: string; active: boolean };

export async function addMenuItem(db: SQLiteDatabase, input: MenuItemInput): Promise<void> {
  await db.runAsync(
    `INSERT INTO menu_items (uid, name, price, color, active, updated_at, dirty, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, 1, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM menu_items))`,
    newUid(), input.name, input.price, input.color, input.active ? 1 : 0, Date.now(),
  );
}

export async function updateMenuItem(db: SQLiteDatabase, id: number, input: MenuItemInput): Promise<void> {
  await db.runAsync(
    'UPDATE menu_items SET name = ?, price = ?, color = ?, active = ?, updated_at = ?, dirty = 1 WHERE id = ?',
    input.name, input.price, input.color, input.active ? 1 : 0, Date.now(), id,
  );
}

/**
 * Soft delete, so the deletion reaches the other phones.
 * Past orders keep their own copy of the name and price, so deleting a menu item never changes history.
 */
export async function deleteMenuItem(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('UPDATE menu_items SET deleted = 1, updated_at = ?, dirty = 1 WHERE id = ?', Date.now(), id);
}

/** Swap an item with its neighbour above (-1) or below (+1). */
export async function moveMenuItem(db: SQLiteDatabase, id: number, direction: -1 | 1): Promise<void> {
  const items = await listMenu(db);
  const i = items.findIndex((m) => m.id === id);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= items.length) return;
  [items[i], items[j]] = [items[j], items[i]];
  const now = Date.now();
  await withTx(db, async () => {
    for (const [index, m] of items.entries()) {
      await db.runAsync(
        'UPDATE menu_items SET sort_order = ?, updated_at = ?, dirty = 1 WHERE id = ? AND sort_order != ?',
        index, now, m.id, index,
      );
    }
  });
}
