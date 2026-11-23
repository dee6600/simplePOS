/** Local database steps when this phone creates, joins or leaves the family shop. */
import type { SQLiteDatabase } from 'expo-sqlite';

import { getDeviceSetting, setDeviceSetting } from '../db/settings';
import { withTx } from '../db/tx';
import { COLLECTIONS } from './remote';

async function resetCursors(db: SQLiteDatabase) {
  for (const c of COLLECTIONS) await setDeviceSetting(db, `cursor_${c}`, null);
}

/** First phone: everything on this phone will be uploaded to the new shop. */
export async function prepareCreate(db: SQLiteDatabase, shopId: string, myPhone: string): Promise<void> {
  await withTx(db, async () => {
    await db.execAsync(`
      UPDATE orders SET dirty = 1; UPDATE menu_items SET dirty = 1; UPDATE money_entries SET dirty = 1;
      UPDATE stock_entries SET dirty = 1; UPDATE stock_items SET dirty = 1 WHERE updated_at > 0;
    `);
    if (!Number((await getDeviceSetting(db, 'settings_updated_at')) ?? 0)) {
      await setDeviceSetting(db, 'settings_updated_at', String(Date.now()));
    }
    await setDeviceSetting(db, 'settings_dirty', '1');
    await resetCursors(db);
    await setDeviceSetting(db, 'shop_id', shopId);
    await setDeviceSetting(db, 'my_phone', myPhone);
  });
}

/**
 * Another phone joins: the menu and shop settings always come from the shop.
 * keepLocal=false (normal): this phone's orders and money entries are removed and the shop's are downloaded.
 * keepLocal=true: this phone's orders and money entries are uploaded into the shop as well.
 * Stock entries go the same way as money entries. Stock items stay: the starting list has the same ids on
 * every phone, and the shop's edits to it are downloaded on top.
 */
export async function prepareJoin(
  db: SQLiteDatabase, shopId: string, myPhone: string, keepLocal: boolean,
): Promise<void> {
  await withTx(db, async () => {
    if (keepLocal) {
      await db.execAsync('UPDATE orders SET dirty = 1; UPDATE money_entries SET dirty = 1; UPDATE stock_entries SET dirty = 1;');
      await db.execAsync('UPDATE order_items SET menu_item_id = NULL, menu_item_uid = NULL;');
    } else {
      await db.execAsync('DELETE FROM order_items; DELETE FROM orders; DELETE FROM money_entries; DELETE FROM stock_entries;');
    }
    await db.execAsync('DELETE FROM menu_items;');
    await setDeviceSetting(db, 'settings_dirty', '0');
    await setDeviceSetting(db, 'settings_updated_at', '0');
    await resetCursors(db);
    await setDeviceSetting(db, 'shop_id', shopId);
    await setDeviceSetting(db, 'my_phone', myPhone);
  });
}

/** Leave the shop. Local data stays on the phone. */
export async function prepareDisconnect(db: SQLiteDatabase): Promise<void> {
  await resetCursors(db);
  await setDeviceSetting(db, 'shop_id', null);
  await setDeviceSetting(db, 'my_phone', null);
}

export async function countLocalOrders(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(
    'SELECT (SELECT COUNT(*) FROM orders WHERE deleted = 0) + (SELECT COUNT(*) FROM money_entries WHERE deleted = 0) AS n',
  );
  return row?.n ?? 0;
}
