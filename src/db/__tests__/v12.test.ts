/**
 * @jest-environment node
 *
 * v1.2: upgrading v1.0 data (the real 18 Nov backup in data/), money entries, Cash/Bank balance.
 */
/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SQLiteDatabase } from 'expo-sqlite';

import { computeBalance } from '../../lib/balance';
import { summarize } from '../../lib/summary';
import { createV1Schema, openTestDb } from '../../test/nodeSqlite';
import { buildBackup, parseBackup, restoreBackup, type Backup } from '../backup';
import { listMenu } from '../menu';
import { migrateDb } from '../migrate';
import { addMoneyEntry, getBalanceSums, listMoneyEntries, setMoneyEntryDeleted, updateMoneyEntry } from '../money';
import { createOrder, listOrders } from '../orders';
import { getSettings, setDeviceSetting } from '../settings';

jest.mock('expo-document-picker', () => ({}));
jest.mock('expo-file-system', () => ({}));
jest.mock('expo-sharing', () => ({}));
jest.mock('expo-crypto', () => ({ randomUUID: () => jest.requireActual('node:crypto').randomUUID() }));

const ALL = { start: 0, end: Number.MAX_SAFE_INTEGER };
const DATA_FILE = join(__dirname, '../../../data/simplepos-backup-2026-11-18.json');
const hasData = existsSync(DATA_FILE);
const realBackup = (): Backup => parseBackup(readFileSync(DATA_FILE, 'utf8'));

async function expectRealData(db: SQLiteDatabase) {
  const orders = await listOrders(db, ALL);
  const menu = await listMenu(db);
  const s = summarize(orders, menu.map((m) => m.id));
  expect(orders).toHaveLength(43);
  expect([s.total, s.upi, s.cash]).toEqual([10420, 5660, 4760]);
  expect(menu.map((m) => m.name)).toEqual([
    'Chicken Biryani Half', 'Chicken Biryani Full', 'Tandoori Biryani Half', 'Tandoori Biryani Full',
    'Chicken 65', 'Water Bottle', 'KHUSHKA',
  ]);
  expect((await getSettings(db)).restaurantName).toBe('REDDYS BIRYANI');

  // Every synced row has a unique uid and is queued for upload.
  const rows = await db.getAllAsync<{ uid: string | null; dirty: number }>(
    'SELECT uid, dirty FROM orders UNION ALL SELECT uid, dirty FROM menu_items',
  );
  expect(rows).toHaveLength(46 + 7);
  expect(rows.every((r) => r.uid && r.dirty === 1)).toBe(true);
  expect(new Set(rows.map((r) => r.uid)).size).toBe(rows.length);
  const missing = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM order_items WHERE menu_item_id IS NOT NULL AND menu_item_uid IS NULL',
  );
  expect(missing?.n).toBe(0);
  return { orders, s };
}

(hasData ? describe : describe.skip)('real 18 Nov data', () => {
  test('upgrading a v1.0 phone in place keeps every order and queues it for upload', async () => {
    const db = openTestDb();
    await createV1Schema(db);
    const b = realBackup();
    const cols = {
      menu_items: ['id', 'name', 'price', 'color', 'sort_order', 'active'],
      orders: ['id', 'order_no', 'created_at', 'updated_at', 'status', 'order_type', 'total', 'deleted'],
      order_items: ['id', 'order_id', 'menu_item_id', 'name', 'price', 'qty'],
      settings: ['key', 'value'],
    } as const;
    for (const [t, c] of Object.entries(cols)) {
      for (const row of b[t as keyof typeof cols]) {
        await db.runAsync(
          `INSERT INTO ${t} (${c.join(', ')}) VALUES (${c.map(() => '?').join(', ')})`,
          ...c.map((k) => row[k] ?? null),
        );
      }
    }

    await migrateDb(db);
    expect(await db.getFirstAsync('PRAGMA user_version')).toEqual({ user_version: 4 });
    await expectRealData(db);
    await migrateDb(db); // idempotent
    await expectRealData(db);
  });

  test('restoring the v1 backup file into v1.2 works and marks orders "Imported"', async () => {
    const db = openTestDb();
    await migrateDb(db);
    await restoreBackup(db, realBackup());
    const { orders } = await expectRealData(db);
    expect(new Set(orders.map((o) => o.created_by))).toEqual(new Set(['Imported']));
  });
});

test('expenses and lump sums move the Cash / Bank balance', async () => {
  const db = openTestDb();
  await migrateDb(db);
  await setDeviceSetting(db, 'user_name', 'Mom');
  const menu = await listMenu(db);
  const line = (i: number, qty: number) => ({
    menu_item_id: menu[i].id, name: menu[i].name, price: menu[i].price, qty,
  });
  await createOrder(db, { lines: [line(1, 2)], status: 'cash', orderType: null }); // 400 cash
  await createOrder(db, { lines: [line(0, 1)], status: 'upi', orderType: null }); // 120 bank
  // An old unpaid order (saved before v1.3) counts in sales but not in the balance.
  await db.runAsync("UPDATE orders SET status = 'pending' WHERE id = ?", (await createOrder(db, { lines: [line(5, 1)], status: 'cash', orderType: null })).id); // 20

  await addMoneyEntry(db, { kind: 'in', amount: 5000, method: 'cash', category: null, note: 'Opening cash' });
  const rice = await addMoneyEntry(db, { kind: 'expense', amount: 1200, method: 'cash', category: 'Rice', note: '' });
  await addMoneyEntry(db, { kind: 'expense', amount: 300, method: 'bank', category: 'Packing', note: 'boxes' });
  await addMoneyEntry(db, { kind: 'out', amount: 100, method: 'bank', category: 'Rice', note: 'to home' });

  expect(computeBalance(await getBalanceSums(db))).toEqual({
    cash: 400 + 5000 - 1200, bank: 120 - 300 - 100, total: 4200 - 280,
  });

  const entries = await listMoneyEntries(db, ALL);
  expect(entries.map((e) => [e.kind, e.category, e.created_by])).toEqual([
    ['out', null, 'Mom'], // lump sums never keep a category
    ['expense', 'Packing', 'Mom'],
    ['expense', 'Rice', 'Mom'],
    ['in', null, 'Mom'],
  ]);
  const orders = await listOrders(db, ALL);
  expect(orders.every((o) => o.created_by === 'Mom')).toBe(true);

  const s = summarize(orders, [], entries);
  expect([s.total, s.expenses, s.profit, s.moneyIn, s.moneyOut]).toEqual([540, 1500, 540 + 5000 - 1500, 5000, 100]); // money added counts as profit, taken out does not
  expect(s.expensesByCategory).toEqual([
    { category: 'Rice', amount: 1200, count: 1 },
    { category: 'Packing', amount: 300, count: 1 },
  ]);

  // Editing and deleting entries changes the balance; undo restores it. Edits record who made them.
  await setDeviceSetting(db, 'user_name', 'Dad');
  await updateMoneyEntry(db, rice, { kind: 'expense', amount: 1000, method: 'bank', category: 'Rice', note: '' });
  let b = computeBalance(await getBalanceSums(db));
  expect([b.cash, b.bank]).toEqual([5400, -1280]);
  const edited = (await listMoneyEntries(db, ALL)).find((e) => e.id === rice);
  expect([edited?.created_by, edited?.updated_by]).toEqual(['Mom', 'Dad']);
  await setMoneyEntryDeleted(db, rice, true);
  b = computeBalance(await getBalanceSums(db));
  expect([b.cash, b.bank]).toEqual([5400, -280]);
  await setMoneyEntryDeleted(db, rice, false);
  expect(computeBalance(await getBalanceSums(db)).bank).toBe(-1280);

  // v1.2 backups carry money entries too.
  const backup = JSON.parse(JSON.stringify(await buildBackup(db)));
  const other = openTestDb();
  await migrateDb(other);
  await restoreBackup(other, backup);
  expect(await listMoneyEntries(other, ALL)).toEqual(await listMoneyEntries(db, ALL));
  expect(computeBalance(await getBalanceSums(other))).toEqual(computeBalance(await getBalanceSums(db)));
});
