/**
 * @jest-environment node
 *
 * Runs the real SQL in src/db against Node's built-in SQLite through a small adapter
 * that mimics the parts of expo-sqlite's async API we use.
 */
/// <reference types="node" />
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';

import { buildBackup, restoreBackup } from '../backup';
import { addMenuItem, deleteMenuItem, listMenu, moveMenuItem, updateMenuItem } from '../menu';
import { DEFAULT_MENU, migrateDb } from '../migrate';
import { createOrder, getOrder, listOrders, setOrderDeleted, setOrderStatus, updateOrder } from '../orders';
import { getSettings, saveSetting } from '../settings';
import { periodRange } from '../../lib/dates';
import type { OrderLine } from '../../lib/types';

jest.mock('expo-document-picker', () => ({}));
jest.mock('expo-file-system', () => ({}));
jest.mock('expo-sharing', () => ({}));

type Params = SQLInputValue[];
const norm = (p: unknown[]): Params => (p.length === 1 && Array.isArray(p[0]) ? p[0] : p) as Params;

function openDb(): SQLiteDatabase {
  const raw = new DatabaseSync(':memory:');
  const db = {
    execAsync: async (sql: string) => raw.exec(sql),
    runAsync: async (sql: string, ...p: unknown[]) => {
      const r = raw.prepare(sql).run(...norm(p));
      return { lastInsertRowId: Number(r.lastInsertRowid), changes: Number(r.changes) };
    },
    getFirstAsync: async (sql: string, ...p: unknown[]) => raw.prepare(sql).get(...norm(p)) ?? null,
    getAllAsync: async (sql: string, ...p: unknown[]) => raw.prepare(sql).all(...norm(p)),
    withTransactionAsync: async (task: () => Promise<void>) => {
      raw.exec('BEGIN');
      try {
        await task();
        raw.exec('COMMIT');
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
    prepareAsync: async (sql: string) => {
      const st = raw.prepare(sql);
      return { executeAsync: async (...p: unknown[]) => st.run(...norm(p)), finalizeAsync: async () => {} };
    },
  };
  return db as unknown as SQLiteDatabase;
}

const NOV18_NOON = new Date(2026, 10, 18, 12).getTime();
let clock = NOV18_NOON;
beforeEach(() => {
  clock = NOV18_NOON;
  jest.spyOn(Date, 'now').mockImplementation(() => (clock += 1000));
});
afterEach(() => jest.restoreAllMocks());

async function setup() {
  const db = openDb();
  await migrateDb(db);
  const menu = await listMenu(db);
  const line = (i: number, qty: number): OrderLine => ({
    menu_item_id: menu[i].id, name: menu[i].name, price: menu[i].price, qty,
  });
  return { db, menu, line };
}

const today = () => periodRange('day', new Date(NOV18_NOON));

test('migration seeds the placeholder menu once and is idempotent', async () => {
  const { db, menu } = await setup();
  expect(menu.map((m) => [m.name, m.price])).toEqual(DEFAULT_MENU.map((m) => [m.name, m.price]));
  await migrateDb(db);
  expect(await listMenu(db)).toHaveLength(DEFAULT_MENU.length);
});

test('create, list, edit, mark paid, delete and undo', async () => {
  const { db, line } = await setup();

  const a = await createOrder(db, { lines: [line(1, 2), line(5, 1)], status: 'cash', orderType: null });
  const b = await createOrder(db, { lines: [line(4, 1)], status: 'pending', orderType: 'parcel' });
  expect([a.orderNo, b.orderNo]).toEqual([1, 2]);

  let orders = await listOrders(db, today());
  expect(orders.map((o) => o.order_no)).toEqual([2, 1]); // newest first
  expect(orders[1]).toMatchObject({ status: 'cash', total: 2 * 200 + 20, order_type: null });
  expect(orders[1].items).toEqual([line(1, 2), line(5, 1)]);
  expect(orders[0]).toMatchObject({ status: 'pending', order_type: 'parcel', total: 150 });

  await setOrderStatus(db, b.id, 'upi');
  expect((await getOrder(db, b.id))?.status).toBe('upi');

  await updateOrder(db, a.id, { lines: [line(0, 3)], status: 'pending', orderType: 'dine_in' });
  const edited = await getOrder(db, a.id);
  expect(edited).toMatchObject({ status: 'pending', order_type: 'dine_in', total: 360, order_no: 1 });
  expect(edited?.items).toEqual([line(0, 3)]);

  await setOrderDeleted(db, b.id, true);
  orders = await listOrders(db, today());
  expect(orders.map((o) => o.id)).toEqual([a.id]);

  // A deleted number is not reused the same day.
  const c = await createOrder(db, { lines: [line(5, 1)], status: 'cash', orderType: null });
  expect(c.orderNo).toBe(3);

  await setOrderDeleted(db, b.id, false);
  expect((await listOrders(db, today())).map((o) => o.order_no)).toEqual([3, 2, 1]);
});

test('order numbers restart at 1 the next day', async () => {
  const { db, line } = await setup();
  await createOrder(db, { lines: [line(0, 1)], status: 'cash', orderType: null });
  await createOrder(db, { lines: [line(0, 1)], status: 'cash', orderType: null });
  clock = new Date(2026, 10, 19, 9).getTime();
  const next = await createOrder(db, { lines: [line(0, 1)], status: 'cash', orderType: null });
  expect(next.orderNo).toBe(1);
  expect(await listOrders(db, today())).toHaveLength(2);
});

test('menu edits never change past orders', async () => {
  const { db, menu, line } = await setup();
  const o = await createOrder(db, { lines: [line(1, 1)], status: 'cash', orderType: null });

  await updateMenuItem(db, menu[1].id, { name: 'Chicken Full', price: 220, color: menu[1].color, active: true });
  await deleteMenuItem(db, menu[5].id);
  await addMenuItem(db, { name: 'Raita', price: 30, color: '#000000', active: false });

  const after = await listMenu(db);
  expect(after.map((m) => m.name)).toEqual([
    'Chicken Biryani Half', 'Chicken Full', 'Mutton Biryani Half', 'Mutton Biryani Full', 'Chicken 65', 'Raita',
  ]);
  expect((await listMenu(db, { activeOnly: true })).map((m) => m.name)).not.toContain('Raita');
  expect((await getOrder(db, o.id))?.items).toEqual([line(1, 1)]); // old name and ₹200 kept

  await moveMenuItem(db, after[5].id, -1);
  await moveMenuItem(db, after[0].id, -1); // already first: no-op
  expect((await listMenu(db)).map((m) => m.name).slice(-2)).toEqual(['Raita', 'Chicken 65']);
});

test('settings defaults and upsert', async () => {
  const { db } = await setup();
  expect(await getSettings(db)).toEqual({ showOrderType: false, restaurantName: 'Biryani House' });
  await saveSetting(db, 'show_order_type', '1');
  await saveSetting(db, 'restaurant_name', 'Sri Biryani');
  await saveSetting(db, 'restaurant_name', 'Sri Biryani Point');
  expect(await getSettings(db)).toEqual({ showOrderType: true, restaurantName: 'Sri Biryani Point' });
});

test('backup round-trip restores everything into another phone', async () => {
  const src = await setup();
  await createOrder(src.db, { lines: [src.line(0, 2), src.line(5, 3)], status: 'upi', orderType: 'parcel' });
  const del = await createOrder(src.db, { lines: [src.line(2, 1)], status: 'cash', orderType: null });
  await setOrderDeleted(src.db, del.id, true);
  await saveSetting(src.db, 'restaurant_name', 'Backup Test');
  const backup = JSON.parse(JSON.stringify(await buildBackup(src.db)));

  const dst = await setup();
  await createOrder(dst.db, { lines: [dst.line(4, 9)], status: 'cash', orderType: null }); // will be replaced
  await restoreBackup(dst.db, backup);

  expect(await listOrders(dst.db, today())).toEqual(await listOrders(src.db, today()));
  expect(await listMenu(dst.db)).toEqual(await listMenu(src.db));
  expect((await getSettings(dst.db)).restaurantName).toBe('Backup Test');
  expect(await buildBackup(dst.db)).toMatchObject({ orders: backup.orders, order_items: backup.order_items });

  // New orders after a restore continue the day's numbering.
  const next = await createOrder(dst.db, { lines: [dst.line(0, 1)], status: 'cash', orderType: null });
  expect(next.orderNo).toBe(3);
});
