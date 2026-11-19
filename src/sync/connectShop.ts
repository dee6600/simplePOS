import { createUserWithEmailAndPassword, signInWithEmailAndPassword, type Auth } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import type { SQLiteDatabase } from 'expo-sqlite';

import { countLocalOrders, prepareCreate, prepareJoin } from './connect';
import { FirestoreRemote } from './firestoreRemote';
import type { RemoteStore } from './remote';
import { normalizePhone, personCredentials, SHOP_ID } from './shopLogin';

/** ask: if both this phone and the shop have data, return 'choose' so the user can decide. */
export type ConnectMode = 'ask' | 'keepLocal' | 'discardLocal';
export type ConnectResult =
  | { status: 'connected'; shopId: string; myPhone: string; created: boolean }
  | { status: 'choose'; localCount: number };

/**
 * One button for every phone: signs this person in with their own number (creating their login the
 * first time) and connects to the family's shop.
 * Empty shop → this phone's data is uploaded. Shop has data → this phone downloads it.
 */
export async function connectShop(
  db: SQLiteDatabase,
  auth: Auth,
  firestore: Firestore,
  phoneInput: string,
  mode: ConnectMode,
): Promise<ConnectResult> {
  const myPhone = normalizePhone(phoneInput);
  if (!myPhone) throw new Error('Enter your 10-digit mobile number.');
  const { email, password } = personCredentials(myPhone);

  await friendly(async () => {
    try {
      return (await signInWithEmailAndPassword(auth, email, password)).user.uid;
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code !== 'auth/user-not-found' && code !== 'auth/invalid-credential' && code !== 'auth/invalid-login-credentials') {
        throw e;
      }
      return (await createUserWithEmailAndPassword(auth, email, password)).user.uid; // first time for this person
    }
  });

  return friendly(() => attachToShop(db, new FirestoreRemote(firestore, SHOP_ID), myPhone, mode));
}

/**
 * Decides whether this phone uploads its data to the shop or downloads the shop's data.
 * Only orders and money entries count as "real data", so the order in which phones sign in can't lose
 * anything: an empty new phone that signs in first never makes the real shop phone discard its orders.
 */
export async function attachToShop(
  db: SQLiteDatabase,
  remote: RemoteStore,
  myPhone: string,
  mode: ConnectMode,
): Promise<ConnectResult> {
  const localCount = await countLocalOrders(db);
  if (!(await remote.hasData())) {
    const cloudMenu = await remote.getAll('menu_items');
    if (localCount === 0 && cloudMenu.some((m) => !m.deleted)) {
      // Nothing here, nothing there yet: take the shop's menu and wait for its data.
      await prepareJoin(db, SHOP_ID, myPhone, false);
      return { status: 'connected', shopId: SHOP_ID, myPhone, created: false };
    }
    // This phone sets up the shop. A menu left by an empty phone is replaced by this phone's menu.
    const localMenu = new Set(
      (await db.getAllAsync<{ uid: string }>('SELECT uid FROM menu_items')).map((r) => r.uid),
    );
    const replaced = cloudMenu
      .filter((m) => !localMenu.has(m.uid) && !m.deleted)
      .map((m) => ({ ...m, deleted: 1, updated_at: Date.now() }));
    if (replaced.length) await remote.push('menu_items', replaced);
    await prepareCreate(db, SHOP_ID, myPhone);
    return { status: 'connected', shopId: SHOP_ID, myPhone, created: true };
  }
  if (localCount > 0 && mode === 'ask') return { status: 'choose', localCount };
  await prepareJoin(db, SHOP_ID, myPhone, mode === 'keepLocal');
  return { status: 'connected', shopId: SHOP_ID, myPhone, created: false };
}

const MESSAGES: Record<string, string> = {
  'auth/network-request-failed': 'No internet connection. Connect to the internet and try again.',
  'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
  'auth/operation-not-allowed': 'Email/Password sign-in is not turned on in the Firebase project (FIREBASE_SETUP.md, step 2).',
  'auth/email-already-in-use': 'This number is registered with a different app setup. Ask the developer.',
  'permission-denied': 'The shop data is locked. Check the Firestore security rules (FIREBASE_SETUP.md, step 4).',
  unavailable: 'No internet connection. Connect to the internet and try again.',
};

/** Turns Firebase errors into plain messages for the family. */
export function friendlyMessage(e: unknown): string {
  const code = (e as { code?: string })?.code;
  if (code && MESSAGES[code]) return MESSAGES[code];
  const msg = e instanceof Error ? e.message : String(e);
  if (/insufficient permissions/i.test(msg)) return MESSAGES['permission-denied'];
  return msg;
}

async function friendly<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    throw new Error(friendlyMessage(e));
  }
}
