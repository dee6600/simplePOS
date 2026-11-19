/**
 * @jest-environment node
 *
 * Imports a SimplePOS backup file (v1 or v1.2) into the family's shop in Firebase, using the app's own
 * upgrade + sync code. The backup's menu replaces the shop's menu; its orders, money entries and shop name
 * are added. Every signed-in phone then receives it.
 *
 *   IMPORT_FILE=data/simplepos-backup-2026-11-18.json IMPORT_PHONE=98765xxxxx npm run import-backup
 *
 * IMPORT_PHONE must be a family number on the `members` list (once the family-list rules are published).
 * Run it once per backup file: running the same v1 file twice would add its orders twice.
 */
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { deleteApp, initializeApp } from 'firebase/app';
import { getAuth, signOut } from 'firebase/auth';
import { getFirestore, terminate } from 'firebase/firestore';

import { parseBackup, restoreBackup } from '../src/db/backup';
import { migrateDb } from '../src/db/migrate';
import { prepareCreate } from '../src/sync/connect';
import { SyncEngine } from '../src/sync/engine';
import { FirestoreRemote } from '../src/sync/firestoreRemote';
import { SHOP_ID } from '../src/sync/shopLogin';
import { connectShop } from '../src/sync/connectShop';
import { openTestDb } from '../src/test/nodeSqlite';

jest.mock('expo-document-picker', () => ({}));
jest.mock('expo-file-system', () => ({}));
jest.mock('expo-sharing', () => ({}));
jest.mock('expo-crypto', () => ({ randomUUID: () => jest.requireActual('node:crypto').randomUUID() }));
jest.setTimeout(120_000);

function readEnv(): Record<string, string> {
  return Object.fromEntries(
    readFileSync('.env.local', 'utf8')
      .split('\n')
      .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
      .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
  );
}

test('import backup into the family shop', async () => {
  const file = process.env.IMPORT_FILE;
  const phone = process.env.IMPORT_PHONE;
  if (!file || !phone) throw new Error('Set IMPORT_FILE and IMPORT_PHONE');
  const env = readEnv();
  const app = initializeApp({
    apiKey: env.EXPO_PUBLIC_FIREBASE_API_KEY,
    authDomain: env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    appId: env.EXPO_PUBLIC_FIREBASE_APP_ID,
  });
  const auth = getAuth(app);
  const fs = getFirestore(app);
  const remote = new FirestoreRemote(fs, SHOP_ID);

  // A throwaway local database that holds the backup, upgraded exactly like a phone would.
  const db = openTestDb();
  await migrateDb(db);
  await restoreBackup(db, parseBackup(readFileSync(file, 'utf8')));
  const localUids = new Set((await db.getAllAsync<{ uid: string }>('SELECT uid FROM menu_items')).map((r) => r.uid));

  // Sign in as a family member (an empty local shop for connectShop, so it never discards anything).
  const emptyDb = openTestDb();
  await migrateDb(emptyDb);
  await connectShop(emptyDb, auth, fs, phone, 'keepLocal');

  // The backup's menu replaces whatever menu the shop has (e.g. placeholders from a new phone).
  const replaced = (await remote.getAll('menu_items'))
    .filter((m) => !localUids.has(m.uid) && !m.deleted)
    .map((m) => ({ ...m, deleted: 1, updated_at: Date.now() }));
  if (replaced.length) await remote.push('menu_items', replaced);

  await prepareCreate(db, SHOP_ID, phone);
  const engine = new SyncEngine(db, remote, { debounceMs: 10 });
  await engine.start();
  for (let i = 0; i < 100 && !(engine.getStatus().state === 'synced' && engine.getStatus().waiting === 0); i++) {
    await new Promise((r) => setTimeout(r, 300));
  }
  const status = engine.getStatus();
  engine.stop();
  expect(status).toMatchObject({ state: 'synced', waiting: 0 });

  const orders = (await remote.getAll('orders')).filter((o) => !o.deleted);
  const menu = (await remote.getAll('menu_items')).filter((m) => !m.deleted);
  console.log(
    `Imported. Shop now has ${orders.length} orders (₹${orders.reduce((s, o) => s + Number(o.total), 0)}), ` +
      `menu: ${menu.map((m) => `${m.name} ₹${m.price}`).join(', ')}. Replaced ${replaced.length} old menu items.`,
  );

  // Optional: remove the login used for the import (e.g. when a placeholder number was used).
  if (process.env.IMPORT_DELETE_LOGIN === '1') await auth.currentUser?.delete();
  else await signOut(auth);
  await terminate(fs);
  await deleteApp(app);
});
