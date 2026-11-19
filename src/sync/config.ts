/**
 * Firebase project settings. Fill these in from:
 * Firebase console → Project settings → General → Your apps → Web app → "SDK setup and configuration" → Config.
 * These values are not secret (they identify the project; the security rules protect the data).
 * See FIREBASE_SETUP.md.
 */
export const firebaseConfig = {
  apiKey: "AIzaSyCFQkauztuHxd7UJVhhqid1AJgsdH06lDY",
  authDomain: "reddys-biryani-pos.firebaseapp.com",
  projectId: "reddys-biryani-pos",
  storageBucket: "reddys-biryani-pos.firebasestorage.app",
  messagingSenderId: "377903450726",
  appId: "1:377903450726:web:8ca1ccdbdae345ac33fba7"
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
