/**
 * Firebase project settings come from the private `.env.local` file (never committed; see FIREBASE_SETUP.md),
 * so the public code is not connected to any family's shop. Without the file, sync is off and the app
 * works on one phone only. Expo builds the values into the app (they must be read as written below).
 */
export const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? '',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? '',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? '',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? '',
};

/**
 * Development only: set EXPO_PUBLIC_FIREBASE_EMULATOR_HOST=127.0.0.1 when starting Expo to use the local
 * Firebase emulator (npx firebase-tools emulators:start --only auth,firestore --project demo-simplepos).
 * Release builds never set it.
 */
export const EMULATOR_HOST = process.env.EXPO_PUBLIC_FIREBASE_EMULATOR_HOST || '';

export function isFirebaseConfigured(): boolean {
  return Boolean(EMULATOR_HOST || (firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId));
}
