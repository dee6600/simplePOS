/**
 * @jest-environment node
 *
 * Real Firestore + Auth (local emulator, no Google account needed) with the real phone-number login,
 * adapter, engine and security rules. Runs only inside the emulator:  npm run test:emulator
 */
/// <reference types="node" />
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { collection, connectFirestoreEmulator, getDocs, getFirestore, terminate } from 'firebase/firestore';

import { listMenu } from '../../db/menu';
import { migrateDb } from '../../db/migrate';
import { addMoneyEntry, listMoneyEntries } from '../../db/money';
import { createOrder, listOrders, setOrderStatus } from '../../db/orders';
import { getDeviceSetting, getSettings, saveSetting, setDeviceSetting } from '../../db/settings';
import { addStockEntry, getStockLevels, listStockEntries, listStockItems } from '../../db/stock';
import { openTestDb } from '../../test/nodeSqlite';
import { connectShop } from '../connectShop';
import { listFamilyPhones, reportThisPhone } from '../devices';
import { SyncEngine } from '../engine';
import { FirestoreRemote } from '../firestoreRemote';
import { SHOP_ID } from '../shopLogin';

jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.3.0' } } }));
jest.mock('expo-updates', () => ({ isEmbeddedLaunch: true, updateId: null, createdAt: null, runtimeVersion: '1' }));
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('expo-crypto', () => ({ randomUUID: () => jest.requireActual('node:crypto').randomUUID() }));
jest.setTimeout(60_000);

const RUN = !!process.env.FIRESTORE_EMULATOR_HOST;
const ALL = { start: 0, end: Number.MAX_SAFE_INTEGER };
const apps: FirebaseApp[] = [];

function phoneApp(name: string) {
  const app = initializeApp({ apiKey: 'demo-key', projectId: process.env.GCLOUD_PROJECT ?? 'demo-simplepos', appId: 'demo' }, name);
  apps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
  const fs = getFirestore(app);
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST!.split(':');
  connectFirestoreEmulator(fs, host, Number(port));
  return { auth, fs };
}

async function newPhoneDb(user: string) {
  const db = openTestDb();
  await migrateDb(db);
  await setDeviceSetting(db, 'user_name', user);
  return db;
}

/** Adds a family member the way the owner does in the console (emulator admin access bypasses the rules). */
async function addMember(phone: string, name: string) {
  const project = process.env.GCLOUD_PROJECT ?? 'demo-simplepos';
  const res = await fetch(
    `http://${process.env.FIRESTORE_EMULATOR_HOST}/v1/projects/${project}/databases/(default)/documents/members?documentId=${phone}`,
    {
      method: 'POST',
      headers: { Authorization: 'Bearer owner', 'content-type': 'application/json' },
      body: JSON.stringify({ fields: { name: { stringValue: name } } }),
    },
  );
  if (!res.ok) throw new Error(`addMember failed: ${res.status}`);
}

async function waitFor(check: () => Promise<boolean>, what: string, ms = 15_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Timed out waiting for: ${what}`);
}

afterAll(async () => {
  for (const a of apps) {
    await terminate(getFirestore(a)).catch(() => {});
    await deleteApp(a).catch(() => {});
  }
});

(RUN ? test : test.skip)('Dad and Mom sign in with their own numbers and share one shop', async () => {
  for (const [phone, name] of [['919876543210', 'Dad'], ['919123456789', 'Mom'], ['919000000001', 'Shree']]) {
    await addMember(phone, name);
  }

  // Someone with the public code but a number that isn't on the family list gets nothing.
  const stranger = phoneApp('stranger');
  const strangerDb = await newPhoneDb('Stranger');
  await expect(connectShop(strangerDb, stranger.auth, stranger.fs, '95555 55555', 'ask')).rejects.toThrow(
    'not on the family list',
  );
  await expect(getDocs(collection(stranger.fs, 'shops', SHOP_ID, 'orders'))).rejects.toMatchObject({
    code: 'permission-denied',
  });
  await expect(getDocs(collection(stranger.fs, 'members'))).rejects.toMatchObject({ code: 'permission-denied' });

  // Dad's phone already has the shop's data from before sync.
  const dad = phoneApp('dad');
  const dadDb = await newPhoneDb('Dad');
  await saveSetting(dadDb, 'restaurant_name', 'REDDYS BIRYANI');
  const m = (await listMenu(dadDb))[1];
  await createOrder(dadDb, { lines: [{ menu_item_id: m.id, name: m.name, price: m.price, qty: 2 }], status: 'cash', orderType: null });
  await addMoneyEntry(dadDb, { kind: 'expense', amount: 1500, method: 'cash', category: 'Rice', note: '25 kg' });

  const first = await connectShop(dadDb, dad.auth, dad.fs, '98765 43210', 'ask');
  expect(first).toMatchObject({ status: 'connected', created: true, myPhone: '919876543210' });
  expect(await getDeviceSetting(dadDb, 'my_phone')).toBe('919876543210');
  const dadEngine = new SyncEngine(dadDb, new FirestoreRemote(dad.fs, SHOP_ID), { debounceMs: 10 });
  await dadEngine.start();
  await waitFor(async () => dadEngine.getStatus().state === 'synced' && dadEngine.getStatus().waiting === 0, 'Dad upload');

  // Mom: new phone, her own number. Same shop, downloads everything.
  const mom = phoneApp('mom');
  const momDb = await newPhoneDb('Mom');
  const joined = await connectShop(momDb, mom.auth, mom.fs, '+91 91234 56789', 'ask');
  expect(joined).toMatchObject({ status: 'connected', created: false });
  expect(mom.auth.currentUser?.uid).not.toBe(dad.auth.currentUser?.uid); // separate logins
  const momEngine = new SyncEngine(momDb, new FirestoreRemote(mom.fs, SHOP_ID), { debounceMs: 10 });
  await momEngine.start();
  await waitFor(async () => (await listOrders(momDb, ALL)).length === 1 && (await listMoneyEntries(momDb, ALL)).length === 1, 'Mom download');
  expect((await listOrders(momDb, ALL))[0]).toMatchObject({ total: 400, created_by: 'Dad' });
  expect((await listMoneyEntries(momDb, ALL))[0]).toMatchObject({ category: 'Rice', created_by: 'Dad' });
  await waitFor(async () => (await getSettings(momDb)).restaurantName === 'REDDYS BIRYANI', 'settings');
  expect(await listMenu(momDb)).toHaveLength(6);

  // Live, both directions, with who-did-it.
  await addMoneyEntry(momDb, { kind: 'in', amount: 5000, method: 'bank', category: null, note: 'Opening bank' });
  momEngine.schedulePush();
  await waitFor(async () => (await listMoneyEntries(dadDb, ALL)).some((e) => e.created_by === 'Mom'), 'Mom → Dad');
  await setOrderStatus(momDb, (await listOrders(momDb, ALL))[0].id, 'upi');
  momEngine.schedulePush();
  await waitFor(async () => (await listOrders(dadDb, ALL))[0].status === 'upi', 'status change → Dad');

  // v1.5 stock: an entry with its expense travels through the real rules; strangers can't read it.
  const rice = (await listStockItems(momDb)).find((i) => i.uid === 'stock-rice')!;
  await addStockEntry(momDb, rice, { kind: 'in', qty: 25, note: '', paid: { amount: 1500, method: 'cash' } });
  momEngine.schedulePush();
  await waitFor(async () => (await listStockEntries(dadDb, ALL))[0]?.paid_amount === 1500, 'stock → Dad');
  expect((await getStockLevels(dadDb)).get('stock-rice')).toBe(25);
  await expect(getDocs(collection(stranger.fs, 'shops', SHOP_ID, 'stock'))).rejects.toMatchObject({ code: 'permission-denied' });

  // Each phone reports its app version; family members can list them, strangers can't.
  await reportThisPhone(dad.fs, SHOP_ID, 'dad-phone', 'Dad');
  await reportThisPhone(mom.fs, SHOP_ID, 'mom-phone', 'Mom');
  const phones = await listFamilyPhones(mom.fs, SHOP_ID);
  expect(phones.map((p) => [p.user_name, p.app_version, p.platform, p.update_id]).sort()).toEqual([
    ['Dad', '1.3.0', 'android', ''],
    ['Mom', '1.3.0', 'android', ''],
  ]);
  expect(phones.every((p) => typeof p.seen_at === 'number')).toBe(true);
  await expect(listFamilyPhones(stranger.fs, SHOP_ID)).rejects.toMatchObject({ code: 'permission-denied' });

  // Signing in again with the same number works (e.g. after reinstalling).
  const dad2 = phoneApp('dad-reinstall');
  const dadDb2 = await newPhoneDb('Dad');
  expect(await connectShop(dadDb2, dad2.auth, dad2.fs, '9876543210', 'ask')).toMatchObject({ status: 'connected', created: false });
  expect(dad2.auth.currentUser?.uid).toBe(dad.auth.currentUser?.uid);

  // A phone that has its own orders is asked before mixing them in.
  const shree = phoneApp('shree');
  const shreeDb = await newPhoneDb('Shree');
  await createOrder(shreeDb, { lines: [{ menu_item_id: m.id, name: m.name, price: m.price, qty: 1 }], status: 'cash', orderType: null });
  expect(await connectShop(shreeDb, shree.auth, shree.fs, '9000000001', 'ask')).toEqual({ status: 'choose', localCount: 1 });

  // Signed-out visitors are locked out by the rules.
  const anon = phoneApp('anon');
  await expect(getDocs(collection(anon.fs, 'shops', SHOP_ID, 'orders'))).rejects.toMatchObject({ code: 'permission-denied' });
  await expect(connectShop(momDb, mom.auth, mom.fs, '12345', 'ask')).rejects.toThrow('10-digit');

  dadEngine.stop();
  momEngine.stop();
});
