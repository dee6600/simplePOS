import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, getReactNativePersistence, initializeAuth, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore, initializeFirestore, type Firestore } from 'firebase/firestore';

import { EMULATOR_HOST, firebaseConfig, isFirebaseConfigured } from './config';

type FirebaseHandles = { app: FirebaseApp; auth: Auth; firestore: Firestore };
let handles: FirebaseHandles | null = null;

/** Lazily initialises Firebase. Returns null until config.ts is filled in. */
export function getFirebase(): FirebaseHandles | null {
  if (!isFirebaseConfigured()) return null;
  if (handles) return handles;
  if (getApps().length) {
    // Already initialised (e.g. after a fast refresh in development).
    const app = getApp();
    handles = { app, auth: getAuth(app), firestore: getFirestore(app) };
    return handles;
  }
  const app = initializeApp(
    EMULATOR_HOST ? { apiKey: 'demo-key', projectId: 'demo-simplepos', appId: 'demo' } : firebaseConfig,
  );
  // Keeps the login across app restarts.
  const auth = initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  // React Native has no streaming fetch; long polling is the reliable transport.
  const firestore = initializeFirestore(app, { experimentalForceLongPolling: true });
  if (EMULATOR_HOST) {
    // Development only: talk to the local Firebase emulator instead of the real project.
    connectAuthEmulator(auth, `http://${EMULATOR_HOST}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(firestore, EMULATOR_HOST, 8080);
  }
  handles = { app, auth, firestore };
  return handles;
}
