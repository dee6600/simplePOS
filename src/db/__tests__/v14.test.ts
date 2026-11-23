/**
 * @jest-environment node
 *
 * v1.4: orders and menu items remember who last changed them.
 */
/// <reference types="node" />
import { openTestDb } from '../../test/nodeSqlite';
import { buildBackup, restoreBackup } from '../backup';
import { listMenu, updateMenuItem } from '../menu';
import { migrateDb } from '../migrate';
import { createOrder, listOrders, setOrderDeleted, setOrderStatus } from '../orders';
import { setDeviceSetting } from '../settings';

jest.mock('expo-document-picker', () => ({}));
jest.mock('expo-file-system', () => ({}));
jest.mock('expo-sharing', () => ({}));
jest.mock('expo-crypto', () => ({ randomUUID: () => jest.requireActual('node:crypto').randomUUID() }));

const ALL = { start: 0, end: Number.MAX_SAFE_INTEGER };

test('upgrading a v1.3 phone fills in who last changed each order', async () => {
  const db = openTestDb();
  await migrateDb(db);
  await setDeviceSetting(db, 'user_name', 'Dad');
  await createOrder(db, { lines: [{ menu_item_id: 1, name: 'Water Bottle', price: 20, qty: 1 }], status: 'cash', orderType: null });
  // Turn it back into a v1.3 (database v2) phone.
  await db.execAsync(`
    ALTER TABLE orders DROP COLUMN updated_by;
    ALTER TABLE menu_items DROP COLUMN updated_by;
    PRAGMA user_version = 2;
  `);

  await migrateDb(db);
  expect((await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version).toBe(4);
  const [order] = await listOrders(db, ALL);
  expect([order.created_by, order.updated_by]).toEqual(['Dad', 'Dad']);
  const dirty = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM orders WHERE dirty = 1');
  expect(dirty?.n).toBe(1); // unchanged by the upgrade (it was never uploaded)
});

test('every change records who made it', async () => {
  const db = openTestDb();
  await migrateDb(db);
  await setDeviceSetting(db, 'user_name', 'Dad');
  const { id } = await createOrder(db, { lines: [{ menu_item_id: 1, name: 'Water Bottle', price: 20, qty: 1 }], status: 'cash', orderType: null });
  await setDeviceSetting(db, 'user_name', 'Mom');
  await setOrderStatus(db, id, 'upi');
  let [order] = await listOrders(db, ALL);
  expect([order.created_by, order.updated_by]).toEqual(['Dad', 'Mom']);

  await setDeviceSetting(db, 'user_name', 'Shree');
  await setOrderDeleted(db, id, true);
  const row = await db.getFirstAsync<{ updated_by: string }>('SELECT updated_by FROM orders WHERE id = ?', id);
  expect(row?.updated_by).toBe('Shree');
  await setOrderDeleted(db, id, false);

  const item = (await listMenu(db))[0];
  await updateMenuItem(db, item.id, { name: 'Chicken Half', price: 130, color: item.color, active: true });
  const menuRow = await db.getFirstAsync<{ updated_by: string }>('SELECT updated_by FROM menu_items WHERE id = ?', item.id);
  expect(menuRow?.updated_by).toBe('Shree');

  // Backups keep it; backups made before v1.4 fall back to whoever added the order.
  const backup = await buildBackup(db);
  await restoreBackup(db, backup);
  [order] = await listOrders(db, ALL);
  expect([order.created_by, order.updated_by]).toEqual(['Dad', 'Shree']);
  for (const o of backup.orders) delete o.updated_by;
  await restoreBackup(db, backup);
  [order] = await listOrders(db, ALL);
  expect([order.created_by, order.updated_by]).toEqual(['Dad', 'Dad']);
});
