/**
 * @jest-environment node
 *
 * v1.5: the Stock tab (kitchen stock and biryani weights), with purchases that also save the expense.
 */
/// <reference types="node" />
import { computeBalance } from '../../lib/balance';
import { openTestDb } from '../../test/nodeSqlite';
import { buildBackup, restoreBackup } from '../backup';
import { DEFAULT_STOCK, migrateDb } from '../migrate';
import { getBalanceSums, listMoneyEntries } from '../money';
import { setDeviceSetting } from '../settings';
import {
  addStockEntry, deleteStockItem, getStockLevels, listStockEntries, listStockItems, setStockEntryDeleted, updateStockEntry,
} from '../stock';

jest.mock('expo-document-picker', () => ({}));
jest.mock('expo-file-system', () => ({}));
jest.mock('expo-sharing', () => ({}));
jest.mock('expo-crypto', () => ({ randomUUID: () => jest.requireActual('node:crypto').randomUUID() }));

const ALL = { start: 0, end: Number.MAX_SAFE_INTEGER };

async function freshDb(user = 'Dad') {
  const db = openTestDb();
  await migrateDb(db);
  await setDeviceSetting(db, 'user_name', user);
  return db;
}

const byUid = async (db: Awaited<ReturnType<typeof freshDb>>, uid: string) =>
  (await listStockItems(db)).find((i) => i.uid === uid)!;

test('upgrading a v1.4 phone adds the starting stock list, which is not queued for upload', async () => {
  const db = await freshDb();
  await db.execAsync('DROP TABLE stock_entries; DROP TABLE stock_items; PRAGMA user_version = 3;');
  await migrateDb(db);
  expect((await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version'))?.user_version).toBe(4);
  const items = await listStockItems(db);
  expect(items.map((i) => i.uid)).toEqual(DEFAULT_STOCK.map((s) => s.uid));
  expect(items.filter((i) => i.grp === 'cooked').map((i) => i.name)).toEqual(['Hyderabadi Chicken Biryani', 'Tandoor Chicken Biryani']);
  expect(items.filter((i) => i.grp === 'home').map((i) => i.name)).toEqual(['Rice', 'Barista', 'Oil']);
  const dirty = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM stock_items WHERE dirty = 1');
  expect(dirty?.n).toBe(0);
  await migrateDb(db); // idempotent
  expect(await listStockItems(db)).toHaveLength(DEFAULT_STOCK.length);
});

test('rice bought with an expense, sent to the shop, then edited and deleted with UNDO', async () => {
  const db = await freshDb();
  const rice = await byUid(db, 'stock-rice');
  await addStockEntry(db, rice, { kind: 'in', qty: 25, note: 'Ramesh', paid: { amount: 1500, method: 'cash' } });
  await addStockEntry(db, rice, { kind: 'out', qty: 5, note: '', paid: { amount: 99, method: 'cash' } }); // sent: no expense

  expect((await getStockLevels(db)).get('stock-rice')).toBe(20);
  const [expense, ...others] = await listMoneyEntries(db, ALL);
  expect(others).toHaveLength(0);
  expect(expense).toMatchObject({ kind: 'expense', category: 'Rice', amount: 1500, method: 'cash', note: '25 kg Rice · Ramesh', created_by: 'Dad' });
  expect(computeBalance(await getBalanceSums(db)).cash).toBe(-1500);

  const bought = (await listStockEntries(db, ALL)).find((e) => e.kind === 'in')!;
  expect(bought).toMatchObject({ qty: 25, paid_amount: 1500, paid_method: 'cash', money_uid: expense.uid });

  // Edit: more rice, paid by UPI. The same expense changes.
  await setDeviceSetting(db, 'user_name', 'Mom');
  await updateStockEntry(db, bought, rice, { kind: 'in', qty: 30, note: '', paid: { amount: 1800, method: 'bank' } });
  let [exp] = await listMoneyEntries(db, ALL);
  expect(exp).toMatchObject({ uid: expense.uid, amount: 1800, method: 'bank', updated_by: 'Mom', note: '30 kg Rice' });
  expect((await getStockLevels(db)).get('stock-rice')).toBe(25);

  // Delete removes the expense too; UNDO brings both back.
  const edited = (await listStockEntries(db, ALL)).find((e) => e.kind === 'in')!;
  await setStockEntryDeleted(db, edited, true);
  expect(await listMoneyEntries(db, ALL)).toHaveLength(0);
  expect((await getStockLevels(db)).get('stock-rice')).toBe(-5);
  await setStockEntryDeleted(db, edited, false);
  [exp] = await listMoneyEntries(db, ALL);
  expect(exp.amount).toBe(1800);

  // Clearing "paid" deletes the expense.
  const again = (await listStockEntries(db, ALL)).find((e) => e.kind === 'in')!;
  await updateStockEntry(db, again, rice, { kind: 'in', qty: 30, note: '', paid: null });
  expect(await listMoneyEntries(db, ALL)).toHaveLength(0);
  expect((await listStockEntries(db, ALL)).find((e) => e.kind === 'in')).toMatchObject({ money_uid: null, paid_amount: null });
});

test('biryani entries never save an expense, and can be dated to an earlier day', async () => {
  const db = await freshDb();
  const hyd = await byUid(db, 'stock-hyderabadi');
  const lastNight = new Date(2026, 10, 22, 23, 59).getTime();
  await addStockEntry(db, hyd, { kind: 'in', qty: 12, note: '', paid: { amount: 1, method: 'cash' } });
  await addStockEntry(db, hyd, { kind: 'left', qty: 1.5, note: '', paid: null }, lastNight);
  expect(await listMoneyEntries(db, ALL)).toHaveLength(0);
  const day = { start: new Date(2026, 10, 22).getTime(), end: new Date(2026, 10, 23).getTime() };
  expect((await listStockEntries(db, day)).map((e) => [e.kind, e.qty])).toEqual([['left', 1.5]]);
});

test('backups keep the stock; restoring an older backup starts from the default list', async () => {
  const db = await freshDb();
  const oil = await byUid(db, 'stock-oil');
  await addStockEntry(db, oil, { kind: 'in', qty: 15, note: '', paid: { amount: 2100, method: 'cash' } });
  await deleteStockItem(db, (await byUid(db, 'stock-salt')).id);

  const backup = await buildBackup(db);
  expect(backup.version).toBe(3);
  const other = await freshDb('Mom');
  await restoreBackup(other, backup);
  expect((await getStockLevels(other)).get('stock-oil')).toBe(15);
  expect((await listStockItems(other)).some((i) => i.uid === 'stock-salt')).toBe(false); // deletion kept
  expect((await listStockEntries(other, ALL))[0].paid_amount).toBe(2100);
  // Only real changes are queued for upload: the entry, the deleted Salt, not the untouched defaults.
  const dirtyItems = await other.getAllAsync<{ uid: string }>('SELECT uid FROM stock_items WHERE dirty = 1');
  expect(dirtyItems.map((r) => r.uid)).toEqual(['stock-salt']);

  const old = { ...backup, version: 2 as const, stock_items: undefined, stock_entries: undefined };
  await restoreBackup(other, old);
  expect(await listStockItems(other)).toHaveLength(DEFAULT_STOCK.length);
  expect(await listStockEntries(other, ALL)).toHaveLength(0);
});
