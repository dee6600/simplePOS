import type { SQLiteDatabase } from 'expo-sqlite';

import type { MenuItem } from '../lib/types';

export async function listMenu(db: SQLiteDatabase, opts: { activeOnly?: boolean } = {}): Promise<MenuItem[]> {
  const where = opts.activeOnly ? 'WHERE active = 1' : '';
  return db.getAllAsync<MenuItem>(`SELECT * FROM menu_items ${where} ORDER BY sort_order, id`);
}

export type MenuItemInput = { name: string; price: number; color: string; active: boolean };

export async function addMenuItem(db: SQLiteDatabase, input: MenuItemInput): Promise<void> {
  await db.runAsync(
    `INSERT INTO menu_items (name, price, color, active, sort_order)
     VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM menu_items))`,
    input.name, input.price, input.color, input.active ? 1 : 0,
  );
}

export async function updateMenuItem(db: SQLiteDatabase, id: number, input: MenuItemInput): Promise<void> {
  await db.runAsync(
    'UPDATE menu_items SET name = ?, price = ?, color = ?, active = ? WHERE id = ?',
    input.name, input.price, input.color, input.active ? 1 : 0, id,
  );
}

/** Past orders keep their own copy of the name and price, so deleting a menu item never changes history. */
export async function deleteMenuItem(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM menu_items WHERE id = ?', id);
}

/** Swap an item with its neighbour above (-1) or below (+1). */
export async function moveMenuItem(db: SQLiteDatabase, id: number, direction: -1 | 1): Promise<void> {
  const items = await listMenu(db);
  const i = items.findIndex((m) => m.id === id);
  const j = i + direction;
  if (i < 0 || j < 0 || j >= items.length) return;
  [items[i], items[j]] = [items[j], items[i]];
  await db.withTransactionAsync(async () => {
    for (const [index, m] of items.entries()) {
      await db.runAsync('UPDATE menu_items SET sort_order = ? WHERE id = ?', index, m.id);
    }
  });
}
