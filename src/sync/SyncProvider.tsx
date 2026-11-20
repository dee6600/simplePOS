import { onAuthStateChanged, signOut as firebaseSignOut } from 'firebase/auth';
import { useSQLiteContext, type SQLiteDatabase } from 'expo-sqlite';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';

import { getDeviceSetting, setDeviceSetting } from '../db/settings';
import { emitRemoteChanges, type RemoteChange } from '../lib/changes';
import { emitDataChanged, useDataChanged } from '../lib/events';
import { isFirebaseConfigured } from './config';
import { prepareDisconnect } from './connect';
import { connectShop, friendlyMessage, type ConnectMode, type ConnectResult } from './connectShop';
import { listFamilyPhones, reportThisPhone, type DeviceInfo } from './devices';
import { SyncEngine, type SyncStatus } from './engine';
import { getFirebase } from './firebase';
import { FirestoreRemote } from './firestoreRemote';
import { SHOP_ID } from './shopLogin';

type SyncContextValue = {
  /** False until src/sync/config.ts has the Firebase project settings. */
  configured: boolean;
  connected: boolean;
  /** This person's phone number (normalized, e.g. 919876543210), once signed in. */
  myPhone: string | null;
  status: SyncStatus;
  /** This phone's user ("Dad", "Mom"…), recorded on every order, expense and lump sum. */
  userName: string | null;
  setUserName: (name: string) => Promise<void>;
  /** Show an alert on this phone when someone else adds, changes or deletes something (default on). */
  notifyChanges: boolean;
  setNotifyChanges: (on: boolean) => Promise<void>;
  /** Sign in with this person's number and connect to the family's shop. */
  connect: (phone: string, mode: ConnectMode) => Promise<ConnectResult>;
  signOut: () => Promise<void>;
  syncNow: () => void;
  /** Which app version each family phone (v1.3+) runs. */
  listPhones: () => Promise<DeviceInfo[]>;
};

const OFF: SyncStatus = { state: 'off', waiting: 0, lastSyncedAt: null, error: null };
const SyncContext = createContext<SyncContextValue | null>(null);

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used inside <SyncProvider>');
  return ctx;
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const configured = isFirebaseConfigured();
  const engineRef = useRef<SyncEngine | null>(null);
  const [status, setStatus] = useState<SyncStatus>(OFF);
  const [connected, setConnected] = useState(false);
  const [myPhone, setMyPhone] = useState<string | null>(null);
  const [userName, setUserNameState] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [notifyChanges, setNotifyState] = useState(true);
  // Read by the sync engine's callback, which is created once per connection.
  const alertPrefs = useRef({ on: true, me: '' });
  useEffect(() => {
    alertPrefs.current = { on: notifyChanges, me: userName ?? '' };
  }, [notifyChanges, userName]);

  const stopEngine = useCallback(() => {
    engineRef.current?.stop();
    engineRef.current = null;
    setStatus(OFF);
  }, []);

  const startEngine = useCallback(
    (shopId: string) => {
      const fb = getFirebase();
      if (!fb) return;
      engineRef.current?.stop();
      const engine = new SyncEngine(db, new FirestoreRemote(fb.firestore, shopId), {
        onStatus: (s) => setStatus({ ...s, error: s.error ? friendlyMessage(new Error(s.error)) : null }),
        onRemoteChange: (changes: RemoteChange[]) => {
          emitDataChanged();
          const { on, me } = alertPrefs.current;
          if (on) emitRemoteChanges(changes.filter((c) => !me || c.actor !== me));
        },
      });
      engineRef.current = engine;
      setConnected(true);
      engine.start().catch(() => {});
      reportPhone(db, shopId);
    },
    [db],
  );

  useEffect(() => {
    (async () => {
      setUserNameState(await getDeviceSetting(db, 'user_name'));
      setMyPhone(await getDeviceSetting(db, 'my_phone'));
      setNotifyState((await getDeviceSetting(db, 'notify_changes')) !== '0');
      setLoaded(true);
    })();
  }, [db]);

  // Resume sync on app start when this phone is already signed in.
  useEffect(() => {
    const fb = getFirebase();
    if (!fb) return;
    return onAuthStateChanged(fb.auth, async (user) => {
      const shopId = await getDeviceSetting(db, 'shop_id');
      if (user && shopId === SHOP_ID) {
        if (!engineRef.current) startEngine(SHOP_ID);
      } else if (!user) {
        stopEngine();
        setConnected(false);
      }
    });
  }, [db, startEngine, stopEngine]);

  // Upload soon after any local change, when the app comes back to the foreground, and every 30 s.
  useDataChanged(useCallback(() => engineRef.current?.schedulePush(), []));
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') engineRef.current?.pushNow();
    });
    const timer = setInterval(() => engineRef.current?.schedulePush(), 30_000);
    return () => {
      sub.remove();
      clearInterval(timer);
    };
  }, []);

  const setUserName = useCallback(
    async (name: string) => {
      const trimmed = name.trim();
      await setDeviceSetting(db, 'user_name', trimmed);
      setUserNameState(trimmed);
      if (engineRef.current) reportPhone(db, SHOP_ID);
    },
    [db],
  );

  const setNotifyChanges = useCallback(
    async (on: boolean) => {
      setNotifyState(on);
      await setDeviceSetting(db, 'notify_changes', on ? '1' : '0');
    },
    [db],
  );

  const connect = useCallback(
    async (phone: string, mode: ConnectMode) => {
      const fb = getFirebase();
      if (!fb) throw new Error('Family sync is not set up in this version of the app yet.');
      const result = await connectShop(db, fb.auth, fb.firestore, phone, mode);
      if (result.status === 'connected') {
        setMyPhone(result.myPhone);
        emitDataChanged();
        startEngine(result.shopId);
      }
      return result;
    },
    [db, startEngine],
  );

  // Development only: EXPO_PUBLIC_DEV_AUTOLOGIN_PHONE signs this phone in automatically (used to test
  // sync on a simulator, where nobody can type). Never set in release builds.
  const devPhone = __DEV__ ? process.env.EXPO_PUBLIC_DEV_AUTOLOGIN_PHONE : undefined;
  const triedDevLogin = useRef(false);
  useEffect(() => {
    if (!devPhone || !loaded || !userName || connected || triedDevLogin.current) return;
    triedDevLogin.current = true;
    connect(devPhone, 'discardLocal').catch((e) => console.warn('Dev auto-login failed', e));
  }, [devPhone, loaded, userName, connected, connect]);

  const signOut = useCallback(async () => {
    stopEngine();
    const fb = getFirebase();
    if (fb) await firebaseSignOut(fb.auth);
    await prepareDisconnect(db);
    setMyPhone(null);
    setConnected(false);
  }, [db, stopEngine]);

  const syncNow = useCallback(() => {
    engineRef.current?.pushNow();
  }, []);

  const listPhones = useCallback(async () => {
    const fb = getFirebase();
    return fb ? listFamilyPhones(fb.firestore, SHOP_ID) : [];
  }, []);

  if (!loaded) return null;

  return (
    <SyncContext.Provider
      value={{
        configured,
        connected,
        myPhone,
        status,
        userName,
        setUserName,
        notifyChanges,
        setNotifyChanges,
        connect,
        signOut,
        syncNow,
        listPhones,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
}

/** Records this phone's app version in the shop (best effort: it retries the next time sync starts). */
function reportPhone(db: SQLiteDatabase, shopId: string) {
  const fb = getFirebase();
  if (!fb) return;
  (async () => {
    const deviceId = await getDeviceSetting(db, 'device_id');
    const userName = await getDeviceSetting(db, 'user_name');
    if (deviceId) await reportThisPhone(fb.firestore, shopId, deviceId, userName ?? '');
  })().catch(() => {});
}
