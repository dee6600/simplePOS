// Metro loads Firebase Auth's React Native build, which exports getReactNativePersistence,
// but TypeScript resolves the web type definitions, which don't declare it.
import type { Persistence, ReactNativeAsyncStorage } from 'firebase/auth';

declare module 'firebase/auth' {
  export function getReactNativePersistence(storage: ReactNativeAsyncStorage): Persistence;
}
