/**
 * Converts between local SQLite rows and cloud documents.
 * Rule for conflicts: the version with the newest `updated_at` wins (last write wins).
 */
import type { SQLiteDatabase } from 'expo-sqlite';

import { getDeviceSetting, getSettings, setDeviceSetting } from '../db/settings';
import { withTx } from '../db/tx';
import type { ChangeKind, RemoteChange } from '../lib/changes';
import { formatRupees } from '../lib/format';
import type { CollectionName, IncomingDoc, RemoteDoc } from './remote';

const TABLE: Record<Exclude<CollectionName, 'meta'>, string> = {
  menu_items: 'menu_items',
  orders: 'orders',
  money: 'money_entries',
};

const FIELDS = {
  menu_items: ['uid', 'name', 'price', 'color', 'sort_order', 'active', 'deleted', 'updated_at', 'updated_by'],
  orders: [
    'uid', 'order_no', 'created_at', 'updated_at', 'status', 'order_type', 'total', 'deleted', 'created_by', 'updated_by',
  ],
  money: [
    'uid', 'kind', 'created_at', 'updated_at', 'category', 'amount', 'method', 'note', 'created_by', 'updated_by', 'deleted',
  ],
} as const;

type Row = Record<string, unknown>;

/** Rows waiting to upload, as cloud documents. */
export async function collectDirty(db: SQLiteDatabase, c: CollectionName, limit = 400): Promise<RemoteDoc[]> {
  if (c === 'meta') {
    if ((await getDeviceSetting(db, 'settings_dirty')) !== '1') return [];
    const s = await getSettings(db);
    return [{
      uid: 'settings',
      restaurant_name: s.restaurantName,
      show_order_type: s.showOrderType,
      updated_at: Number((await getDeviceSetting(db, 'settings_updated_at')) ?? 0),
    }];
  }
  const rows = await db.getAllAsync<Row & { id: number; uid: string; updated_at: number }>(
    `SELECT id, ${FIELDS[c].join(', ')} FROM ${TABLE[c]} WHERE dirty = 1 ORDER BY id LIMIT ?`, limit,
  );
  if (c !== 'orders' || rows.length === 0) return rows.map(({ id: _id, ...doc }) => doc as RemoteDoc);

  const items = await db.getAllAsync<{ order_id: number; menu_item_uid: string | null; name: string; price: number; qty: number }>(
    `SELECT order_id, menu_item_uid, name, price, qty FROM order_items
     WHERE order_id IN (${rows.map(() => '?').join(', ')}) ORDER BY id`,
    ...rows.map((r) => r.id),
  );
  return rows.map(({ id, ...doc }) => ({
    ...doc,
    items: items
      .filter((it) => it.order_id === id)
      .map(({ menu_item_uid, name, price, qty }) => ({ menu_item_uid, name, price, qty })),
  }) as RemoteDoc);
}

/** After a successful upload: clear the flag, unless the row was edited again meanwhile. */
export async function markClean(db: SQLiteDatabase, c: CollectionName, docs: RemoteDoc[]): Promise<void> {
  if (c === 'meta') {
    const current = Number((await getDeviceSetting(db, 'settings_updated_at')) ?? 0);
    if (docs.some((d) => d.updated_at === current)) await setDeviceSetting(db, 'settings_dirty', '0');
    return;
  }
  for (const d of docs) {
    await db.runAsync(`UPDATE ${TABLE[c]} SET dirty = 0 WHERE uid = ? AND updated_at = ?`, d.uid, d.updated_at);
  }
}

export async function countDirty(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>(`
    SELECT (SELECT COUNT(*) FROM orders WHERE dirty = 1)
         + (SELECT COUNT(*) FROM menu_items WHERE dirty = 1)
         + (SELECT COUNT(*) FROM money_entries WHERE dirty = 1) AS n
  `);
  const settings = (await getDeviceSetting(db, 'settings_dirty')) === '1' ? 1 : 0;
  return (row?.n ?? 0) + settings;
}

const val = (v: unknown) => (v === undefined ? null : (v as string | number | null));
/** Phones on v1.3 and older don't send updated_by; the column can't be NULL. */
const fieldVal = (d: Row, f: string) => (f.endsWith('_by') ? String(d[f] ?? '') : val(d[f]));

const KIND: Record<Exclude<CollectionName, 'meta'>, ChangeKind> = { menu_items: 'menu', orders: 'order', money: 'money' };

function changeLabel(c: CollectionName, d: Row): string {
  if (c === 'orders') return `Order #${d.order_no}`;
  if (c === 'menu_items') return `Menu: ${d.name}`;
  const amount = formatRupees(Number(d.amount ?? 0));
  if (d.kind === 'expense') return d.category ? `Expense ${amount} · ${d.category}` : `Expense ${amount}`;
  return d.kind === 'in' ? `Add money ${amount}` : `Take out ${amount}`;
}

/** Null when there's nothing worth telling: added and deleted before this phone saw it, or edited while deleted. */
function changeAction(wasDeleted: boolean, isDeleted: boolean, isNew: boolean): RemoteChange['action'] | null {
  if (isNew) return isDeleted ? null : 'added';
  if (isDeleted) return wasDeleted ? null : 'deleted';
  return wasDeleted ? 'restored' : 'edited';
}

/**
 * Writes cloud changes into the local database. Returns how many rows changed, and what changed in a
 * form the "Order #12 changed by Mom" alert can show.
 */
export async function applyIncoming(
  db: SQLiteDatabase, c: CollectionName, docs: IncomingDoc[],
): Promise<{ applied: number; changes: RemoteChange[] }> {
  let applied = 0;
  const changes: RemoteChange[] = [];
  await withTx(db, async () => {
    if (c === 'meta') {
      for (const d of docs) {
        if (d.uid !== 'settings') continue;
        const local = Number((await getDeviceSetting(db, 'settings_updated_at')) ?? 0);
        if (d.updated_at <= local) continue;
        const put = (key: string, value: string) =>
          db.runAsync(
            'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
            key, value,
          );
        if (typeof d.restaurant_name === 'string') await put('restaurant_name', d.restaurant_name);
        if (typeof d.show_order_type === 'boolean') await put('show_order_type', d.show_order_type ? '1' : '0');
        await setDeviceSetting(db, 'settings_updated_at', String(d.updated_at));
        await setDeviceSetting(db, 'settings_dirty', '0');
        applied += 1;
        changes.push({ kind: 'settings', action: 'edited', localId: null, actor: '', label: 'Shop settings', at: d.updated_at });
      }
      return;
    }

    const table = TABLE[c];
    const fields = FIELDS[c];
    for (const d of docs) {
      const local = await db.getFirstAsync<{ id: number; updated_at: number; dirty: number; deleted: number }>(
        `SELECT id, updated_at, dirty, deleted FROM ${table} WHERE uid = ?`, d.uid,
      );
      if (local && d.updated_at < local.updated_at) continue; // our copy is newer; it will upload
      if (local && d.updated_at === local.updated_at) {
        if (local.dirty) await db.runAsync(`UPDATE ${table} SET dirty = 0 WHERE id = ?`, local.id); // our own upload
        continue;
      }
      let id: number;
      if (local) {
        await db.runAsync(
          `UPDATE ${table} SET ${fields.map((f) => `${f} = ?`).join(', ')}, dirty = 0 WHERE id = ?`,
          ...fields.map((f) => fieldVal(d, f)), local.id,
        );
        id = local.id;
      } else {
        const res = await db.runAsync(
          `INSERT INTO ${table} (${fields.join(', ')}, dirty) VALUES (${fields.map(() => '?').join(', ')}, 0)`,
          ...fields.map((f) => fieldVal(d, f)),
        );
        id = res.lastInsertRowId;
      }
      if (c === 'orders') {
        await db.runAsync('DELETE FROM order_items WHERE order_id = ?', id);
        const items = Array.isArray(d.items) ? (d.items as Row[]) : [];
        for (const it of items) {
          await db.runAsync(
            `INSERT INTO order_items (order_id, menu_item_uid, menu_item_id, name, price, qty)
             VALUES (?, ?, (SELECT id FROM menu_items WHERE uid = ?), ?, ?, ?)`,
            id, val(it.menu_item_uid), val(it.menu_item_uid), val(it.name), val(it.price), val(it.qty),
          );
        }
      }
      applied += 1;
      const action = changeAction(Boolean(local?.deleted), Boolean(d.deleted), !local);
      if (action) {
        const actor = action === 'added' && c !== 'menu_items' ? d.created_by : d.updated_by;
        changes.push({
          kind: KIND[c], action, localId: id, actor: String(actor ?? ''), label: changeLabel(c, d), at: d.updated_at,
        });
      }
    }

    if ((c === 'menu_items' || c === 'orders') && applied > 0) {
      // Lines without a menu link (e.g. kept when joining the shop) are matched by dish name,
      // so the Summary counts them with the same dish instead of as a separate row.
      await db.execAsync(`
        UPDATE order_items SET menu_item_uid = (
          SELECT m.uid FROM menu_items m WHERE m.deleted = 0 AND m.name = order_items.name ORDER BY m.id LIMIT 1
        )
        WHERE menu_item_uid IS NULL;
        UPDATE order_items SET menu_item_id = (SELECT m.id FROM menu_items m WHERE m.uid = order_items.menu_item_uid)
        WHERE menu_item_uid IS NOT NULL AND menu_item_id IS NULL;
      `);
    }
  });
  return { applied, changes };
}
