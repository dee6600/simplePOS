import { randomUUID } from 'expo-crypto';

/** Globally unique id for a synced row, so records from different phones never collide. */
export function newUid(): string {
  return randomUUID();
}
