/**
 * @jest-environment node
 *
 * Two (or three) simulated phones syncing through an in-memory cloud.
 */
/// <reference types="node" />
import type { SQLiteDatabase } from 'expo-sqlite';

import { computeBalance } from '../../lib/balance';
import { openTestDb } from '../../test/nodeSqlite';
import { listMenu, updateMenuItem } from '../../db/menu';
import { buildBackup, restoreBackup } from '../../db/backup';
import { migrateDb } from '../../db/migrate';
import { addMoneyEntry, getBalanceSums, listMoneyEntries, updateMoneyEntry } from '../../db/money';
import { createOrder, listOrders, setOrderDeleted, setOrderStatus, updateOrder } from '../../db/orders';
import { getSettings, saveSetting, setDeviceSetting } from '../../db/settings';
import type { RemoteChange } from '../../lib/changes';
import { countDirty } from '../mapping';
import { prepareCreate, prepareJoin } from '../connect';
import { attachToShop } from '../connectShop';
import { SyncEngine } from '../engine';
import type { CollectionName, IncomingDoc, RemoteDoc, RemoteStore } from '../remote';

jest.mock('expo-document-picker', () => ({}));
jest.mock('expo-file-system', () => ({}));
jest.mock('expo-sharing', () => ({}));
jest.mock('expo-crypto', () => ({ randomUUID: () => jest.requireActual('node:crypto').randomUUID() }));

const ALL = { start: 0, end: Number.MAX_SAFE_INTEGER };

/** In-memory stand-in for Firestore: server-stamped upserts and live listeners. */
class FakeCloud {
  private docs = new Map<string, IncomingDoc>();
  private listeners = new Set<{ c: CollectionName; since: number; onDocs: (d: IncomingDoc[]) => void }>();
  private serverTime = 1_000_000;
  online = true;

  store(): RemoteStore {
    return {
      push: async (c: CollectionName, docs: RemoteDoc[]) => {
        if (!this.online) throw new Error('offline');
        const stamped = docs.map((d) => ({ ...structuredClone(d), synced_at: ++this.serverTime }));
        for (const d of stamped) this.docs.set(`${c}/${d.uid}`, d);
        for (const l of this.listeners) {
          if (l.c === c) setTimeout(() => l.onDocs(structuredClone(stamped)), 0);
        }
      },
      subscribe: (c, since, onDocs) => {
        const l = { c, since, onDocs };
        this.listeners.add(l);
        const initial = [...this.docs.entries()]
          .filter(([k, d]) => k.startsWith(`${c}/`) && d.synced_at > since)
          .map(([, d]) => structuredClone(d));
        if (initial.length) setTimeout(() => onDocs(initial), 0);
        return () => this.listeners.delete(l);
      },
      hasData: async () => [...this.docs.keys()].some((k) => k.startsWith('orders/') || k.startsWith('money/')),
      getAll: async (c: CollectionName) =>
        [...this.docs.entries()]
          .filter(([k]) => k.startsWith(`${c}/`))
          .map(([, { synced_at: _s, ...d }]) => structuredClone(d) as RemoteDoc),
    };
  }
  count(c: CollectionName) {
    return [...this.docs.keys()].filter((k) => k.startsWith(`${c}/`)).length;
  }
}

type Phone = { db: SQLiteDatabase; engine: SyncEngine; changes: number; alerts: RemoteChange[] };

async function phone(cloud: FakeCloud, name: string): Promise<Phone> {
  const db = openTestDb();
  await migrateDb(db);
  await setDeviceSetting(db, 'user_name', name);
  const p: Phone = { db, engine: null as unknown as SyncEngine, changes: 0, alerts: [] };
  p.engine = new SyncEngine(db, cloud.store(), {
    debounceMs: 1,
    retryMs: 5,
    onRemoteChange: (changes) => {
      p.changes += 1;
      p.alerts.push(...changes);
    },
  });
  return p;
}

async function settle(...phones: Phone[]) {
  for (let i = 0; i < 3; i++) for (const p of phones) await p.engine.idle();
}

let clock = 1_700_000_000_000;
beforeEach(() => jest.spyOn(Date, 'now').mockImplementation(() => (clock += 1000)));
afterEach(() => jest.restoreAllMocks());

const lineFor = async (db: SQLiteDatabase, i: number, qty: number) => {
  const m = (await listMenu(db))[i];
  return { menu_item_id: m.id, name: m.name, price: m.price, qty };
};

test('shop phone uploads; family phone joins and sees everything, live', async () => {
  const cloud = new FakeCloud();
  const shop = await phone(cloud, 'Dad');
  await saveSetting(shop.db, 'restaurant_name', 'REDDYS BIRYANI');
  await createOrder(shop.db, { lines: [await lineFor(shop.db, 1, 2)], status: 'cash', orderType: null });
  await addMoneyEntry(shop.db, { kind: 'expense', amount: 900, method: 'cash', category: 'Oil', note: '' });

  await prepareCreate(shop.db, 'shop1', 'shop@example.com');
  await shop.engine.start();
  await settle(shop);
  expect([cloud.count('orders'), cloud.count('menu_items'), cloud.count('money'), cloud.count('meta')]).toEqual([1, 6, 1, 1]);
  expect(await countDirty(shop.db)).toBe(0);

  const mom = await phone(cloud, 'Mom');
  await prepareJoin(mom.db, 'shop1', 'shop@example.com', false);
  await mom.engine.start();
  await settle(shop, mom);

  expect((await getSettings(mom.db)).restaurantName).toBe('REDDYS BIRYANI');
  expect(await listMenu(mom.db)).toHaveLength(6); // shop's menu only, no duplicate placeholders
  const momOrders = await listOrders(mom.db, ALL);
  expect(momOrders).toHaveLength(1);
  expect(momOrders[0]).toMatchObject({ total: 400, status: 'cash', created_by: 'Dad', order_no: 1 });
  expect(momOrders[0].items[0].menu_item_id).toBe((await listMenu(mom.db))[1].id); // linked to Mom's menu row
  expect(computeBalance(await getBalanceSums(mom.db))).toMatchObject({ cash: 400 - 900, bank: 0 });
  const [oil] = await listMoneyEntries(mom.db, ALL);
  expect([oil.category, oil.created_by, oil.updated_by]).toEqual(['Oil', 'Dad', 'Dad']); // who spent it travels too

  // Live: a new order at the shop shows up on Mom's phone.
  const { id } = await createOrder(shop.db, { lines: [await lineFor(shop.db, 0, 1)], status: 'cash', orderType: null });
  shop.engine.schedulePush();
  await settle(shop, mom);
  expect((await listOrders(mom.db, ALL)).map((o) => o.order_no)).toEqual([2, 1]);
  expect(mom.changes).toBeGreaterThan(0);

  // Mom marks it paid; Dad sees it. Then Dad deletes it; Mom sees that.
  const momCopy = (await listOrders(mom.db, ALL))[0];
  await setOrderStatus(mom.db, momCopy.id, 'upi');
  mom.engine.schedulePush();
  await settle(shop, mom);
  expect((await listOrders(shop.db, ALL))[0].status).toBe('upi');
  await setOrderDeleted(shop.db, id, true);
  shop.engine.schedulePush();
  await settle(shop, mom);
  expect(await listOrders(mom.db, ALL)).toHaveLength(1);

  // Menu and settings edits travel too.
  const menu = (await listMenu(shop.db))[0];
  await updateMenuItem(shop.db, menu.id, { name: 'Chicken Half', price: 130, color: menu.color, active: true });
  await saveSetting(mom.db, 'show_order_type', '1');
  shop.engine.schedulePush();
  mom.engine.schedulePush();
  await settle(shop, mom);
  expect((await listMenu(mom.db))[0]).toMatchObject({ name: 'Chicken Half', price: 130 });
  expect((await getSettings(shop.db)).showOrderType).toBe(true);

  shop.engine.stop();
  mom.engine.stop();
});

test('the newest edit wins when two phones change the same order', async () => {
  const cloud = new FakeCloud();
  const a = await phone(cloud, 'Dad');
  await prepareCreate(a.db, 'shop1', 'e');
  await a.engine.start();
  const { id } = await createOrder(a.db, { lines: [await lineFor(a.db, 0, 1)], status: 'cash', orderType: null });
  a.engine.schedulePush();
  const b = await phone(cloud, 'Brother');
  await prepareJoin(b.db, 'shop1', 'e', false);
  await b.engine.start();
  await settle(a, b);

  // Both edit while "offline" from each other; Brother's edit is later.
  cloud.online = false;
  await updateOrder(a.db, id, { lines: [await lineFor(a.db, 0, 2)], status: 'cash', orderType: null });
  const bId = (await listOrders(b.db, ALL))[0].id;
  await updateOrder(b.db, bId, { lines: [await lineFor(b.db, 0, 3)], status: 'upi', orderType: 'parcel' });
  a.engine.schedulePush();
  b.engine.schedulePush();
  await settle(a, b);
  expect(await countDirty(a.db)).toBeGreaterThan(0); // queued while offline

  cloud.online = true;
  await new Promise((r) => setTimeout(r, 20)); // retry timer
  await settle(a, b);
  for (const p of [a, b]) {
    const [o] = await listOrders(p.db, ALL);
    expect(o).toMatchObject({ status: 'upi', order_type: 'parcel', total: 360 });
    expect(o.items.map((l) => l.qty)).toEqual([3]);
    expect(await countDirty(p.db)).toBe(0);
  }
  a.engine.stop();
  b.engine.stop();
});

test('entries made offline upload later; restarting does not duplicate anything', async () => {
  const cloud = new FakeCloud();
  const shop = await phone(cloud, 'Dad');
  await prepareCreate(shop.db, 'shop1', 'e');
  cloud.online = false;
  await shop.engine.start();
  for (let i = 0; i < 3; i++) {
    await createOrder(shop.db, { lines: [await lineFor(shop.db, 5, 1)], status: 'cash', orderType: null });
  }
  await addMoneyEntry(shop.db, { kind: 'out', amount: 500, method: 'cash', category: null, note: 'to home' });
  shop.engine.schedulePush();
  await settle(shop);
  expect(shop.engine.getStatus()).toMatchObject({ state: 'offline' });
  expect(shop.engine.getStatus().waiting).toBe(3 + 1 + 6 + 1); // orders + money + menu + settings

  cloud.online = true;
  await new Promise((r) => setTimeout(r, 20));
  await settle(shop);
  expect(shop.engine.getStatus()).toMatchObject({ state: 'synced', waiting: 0 });
  expect(cloud.count('orders')).toBe(3);

  const mom = await phone(cloud, 'Mom');
  await prepareJoin(mom.db, 'shop1', 'e', false);
  await mom.engine.start();
  await settle(shop, mom);
  mom.engine.stop();
  await mom.engine.start(); // e.g. app reopened: overlap re-download must not duplicate
  await settle(shop, mom);
  expect(await listOrders(mom.db, ALL)).toHaveLength(3);
  expect(await listMoneyEntries(mom.db, ALL)).toHaveLength(1);
  expect(computeBalance(await getBalanceSums(mom.db)).cash).toBe(60 - 500);
  shop.engine.stop();
  mom.engine.stop();
});

test('joining with "keep local" uploads this phone\'s orders; the default discards them', async () => {
  const cloud = new FakeCloud();
  const shop = await phone(cloud, 'Dad');
  await prepareCreate(shop.db, 'shop1', 'e');
  await shop.engine.start();
  await createOrder(shop.db, { lines: [await lineFor(shop.db, 0, 1)], status: 'cash', orderType: null });
  shop.engine.schedulePush();
  await settle(shop);

  const keep = await phone(cloud, 'Me');
  await createOrder(keep.db, { lines: [await lineFor(keep.db, 2, 1)], status: 'upi', orderType: null });
  await prepareJoin(keep.db, 'shop1', 'e', true);
  await keep.engine.start();
  const discard = await phone(cloud, 'Mom');
  await createOrder(discard.db, { lines: [await lineFor(discard.db, 3, 1)], status: 'upi', orderType: null });
  await prepareJoin(discard.db, 'shop1', 'e', false);
  await discard.engine.start();
  await settle(shop, keep, discard);

  for (const p of [shop, keep, discard]) {
    expect((await listOrders(p.db, ALL)).map((o) => o.total).sort()).toEqual([120, 180]);
    expect(await listMenu(p.db)).toHaveLength(6);
  }
  // The kept order's dish is re-linked to the shop's menu by name, so it isn't a separate Summary row.
  const menu = await listMenu(keep.db);
  const kept = (await listOrders(keep.db, ALL)).find((o) => o.total === 180)!;
  expect(kept.items[0].menu_item_id).toBe(menu.find((m) => m.name === kept.items[0].name)?.id);
  for (const p of [shop, keep, discard]) p.engine.stop();
});

test('an empty phone signing in first never makes the real shop phone lose its data', async () => {
  const cloud = new FakeCloud();

  // Shree's brand-new phone signs in first: it only has the placeholder menu.
  const shree = await phone(cloud, 'Shree');
  expect(await attachToShop(shree.db, cloud.store(), '919000000001', 'ask')).toMatchObject({ created: true });
  await shree.engine.start();
  await settle(shree);

  // Then Dad's shop phone, with the real menu and real orders.
  const dad = await phone(cloud, 'Dad');
  const dadMenu = (await listMenu(dad.db))[0];
  await updateMenuItem(dad.db, dadMenu.id, { name: 'KHUSHKA', price: 80, color: dadMenu.color, active: true });
  await createOrder(dad.db, { lines: [await lineFor(dad.db, 0, 2)], status: 'cash', orderType: null });
  await addMoneyEntry(dad.db, { kind: 'expense', amount: 700, method: 'cash', category: 'Gas', note: '' });
  // Not asked to choose, and nothing on Dad's phone is discarded.
  expect(await attachToShop(dad.db, cloud.store(), '919876543210', 'ask')).toMatchObject({ status: 'connected', created: true });
  await dad.engine.start();
  await settle(shree, dad);

  for (const p of [dad, shree]) {
    const menu = await listMenu(p.db);
    expect(menu).toHaveLength(6); // Dad's menu only; Shree's placeholders were replaced
    expect(menu[0].name).toBe('KHUSHKA');
    expect((await listOrders(p.db, ALL)).map((o) => [o.total, o.created_by])).toEqual([[160, 'Dad']]);
    expect(await listMoneyEntries(p.db, ALL)).toHaveLength(1);
  }

  // A fourth, empty phone now just downloads.
  const mom = await phone(cloud, 'Mom');
  expect(await attachToShop(mom.db, cloud.store(), '919123456789', 'ask')).toMatchObject({ created: false });
  await mom.engine.start();
  await settle(dad, shree, mom);
  expect((await listMenu(mom.db)).map((m) => m.name)[0]).toBe('KHUSHKA');
  expect(await listOrders(mom.db, ALL)).toHaveLength(1);
  for (const p of [dad, shree, mom]) p.engine.stop();
});

test('"Add this phone\'s orders" skips orders the shop already has (e.g. imported from this phone\'s backup)', async () => {
  const cloud = new FakeCloud();
  // The shop phone's data, before v1.2: two orders yesterday.
  const dad = await phone(cloud, 'Dad');
  await createOrder(dad.db, { lines: [await lineFor(dad.db, 0, 1)], status: 'cash', orderType: null });
  await createOrder(dad.db, { lines: [await lineFor(dad.db, 1, 2)], status: 'upi', orderType: null });
  const v1Backup = JSON.parse(JSON.stringify(await buildBackup(dad.db)));

  // Those orders were imported into the shop from the backup (old file: no uids, so they get new ones).
  const importer = await phone(cloud, 'Import');
  for (const t of ['menu_items', 'orders', 'money_entries'] as const) {
    for (const row of v1Backup[t] ?? []) delete row.uid;
  }
  await restoreBackup(importer.db, { ...v1Backup, version: 1 });
  await prepareCreate(importer.db, 'main', '');
  await importer.engine.start();
  await settle(importer);

  // Meanwhile Dad took a new order today, then signs in and keeps his data.
  await createOrder(dad.db, { lines: [await lineFor(dad.db, 5, 3)], status: 'cash', orderType: null });
  expect(await attachToShop(dad.db, cloud.store(), '919876543210', 'ask')).toMatchObject({ status: 'choose' });
  expect(await attachToShop(dad.db, cloud.store(), '919876543210', 'keepLocal')).toMatchObject({ status: 'connected' });
  await dad.engine.start();
  await settle(importer, dad);

  for (const p of [dad, importer]) {
    expect((await listOrders(p.db, ALL)).map((o) => o.total).sort((a, b) => a - b)).toEqual([60, 120, 400]);
  }
  expect(cloud.count('orders')).toBe(3);
  importer.engine.stop();
  dad.engine.stop();
});

test('other phones are told what changed and who did it', async () => {
  const cloud = new FakeCloud();
  const shop = await phone(cloud, 'Dad');
  const { id } = await createOrder(shop.db, { lines: [await lineFor(shop.db, 1, 2)], status: 'cash', orderType: null });
  await prepareCreate(shop.db, 'shop1', 'e');
  await shop.engine.start();
  await settle(shop);

  // Joining an hour later: the shop's history downloads quietly.
  clock += 3_600_000;
  const mom = await phone(cloud, 'Mom');
  await prepareJoin(mom.db, 'shop1', 'e', false);
  await mom.engine.start();
  await settle(shop, mom);
  expect(mom.alerts).toEqual([]);
  expect(await listOrders(mom.db, ALL)).toHaveLength(1);

  const pick = (p: Phone) => p.alerts.splice(0).map(({ kind, action, actor, label }) => ({ kind, action, actor, label }));

  // Dad edits his order, adds an expense; Mom is told, and the alert opens Mom's copy of the order.
  await updateOrder(shop.db, id, { lines: [await lineFor(shop.db, 1, 3)], status: 'upi', orderType: null });
  await addMoneyEntry(shop.db, { kind: 'expense', amount: 900, method: 'cash', category: 'Oil', note: '' });
  shop.engine.schedulePush();
  await settle(shop, mom);
  const momOrderId = (await listOrders(mom.db, ALL))[0].id;
  expect(mom.alerts.find((a) => a.kind === 'order')?.localId).toBe(momOrderId);
  expect(pick(mom)).toEqual([
    { kind: 'order', action: 'edited', actor: 'Dad', label: 'Order #1' },
    { kind: 'money', action: 'added', actor: 'Dad', label: 'Expense ₹900 · Oil' },
  ]);
  expect(shop.alerts).toEqual([]); // Dad's own changes never alert Dad

  // Mom corrects the expense and marks the order paid by cash: Dad sees her name on both.
  const [oil] = await listMoneyEntries(mom.db, ALL);
  await updateMoneyEntry(mom.db, oil.id, { kind: 'expense', amount: 950, method: 'cash', category: 'Oil', note: '' });
  await setOrderStatus(mom.db, momOrderId, 'cash');
  mom.engine.schedulePush();
  await settle(shop, mom);
  expect(pick(shop)).toEqual([
    { kind: 'order', action: 'edited', actor: 'Mom', label: 'Order #1' },
    { kind: 'money', action: 'edited', actor: 'Mom', label: 'Expense ₹950 · Oil' },
  ]);
  const dadOrder = (await listOrders(shop.db, ALL))[0];
  expect([dadOrder.created_by, dadOrder.updated_by]).toEqual(['Dad', 'Mom']);

  // Delete, then undo.
  await setOrderDeleted(shop.db, id, true);
  shop.engine.schedulePush();
  await settle(shop, mom);
  await setOrderDeleted(shop.db, id, false);
  shop.engine.schedulePush();
  await settle(shop, mom);
  expect(pick(mom).map((a) => a.action)).toEqual(['deleted', 'restored']);

  // Menu changes say who made them.
  const item = (await listMenu(shop.db))[0];
  await updateMenuItem(shop.db, item.id, { name: 'Chicken Half', price: 130, color: item.color, active: true });
  shop.engine.schedulePush();
  await settle(shop, mom);
  expect(pick(mom)).toEqual([{ kind: 'menu', action: 'edited', actor: 'Dad', label: 'Menu: Chicken Half' }]);

  // A phone still on v1.3 doesn't send updated_by: the change still applies, with nobody named.
  const [cloudOrder] = (await cloud.store().getAll('orders')) as RemoteDoc[];
  const { updated_by: _dropped, ...oldStyle } = cloudOrder;
  await cloud.store().push('orders', [{ ...oldStyle, status: 'upi', updated_at: Date.now() }]);
  await settle(shop, mom);
  expect(pick(mom)).toEqual([{ kind: 'order', action: 'edited', actor: '', label: 'Order #1' }]);
  expect((await listOrders(mom.db, ALL))[0]).toMatchObject({ status: 'upi', updated_by: '' });

  shop.engine.stop();
  mom.engine.stop();
});
