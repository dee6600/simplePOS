import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';

import type { CollectionName, IncomingDoc, RemoteDoc, RemoteStore } from './remote';

/** Stores the shop under shops/{shopId}/{collection}/{uid}. One order = one document (items embedded). */
export class FirestoreRemote implements RemoteStore {
  constructor(
    private fs: Firestore,
    private shopId: string,
  ) {}

  private col(c: CollectionName) {
    return collection(this.fs, 'shops', this.shopId, c);
  }

  async push(c: CollectionName, docs: RemoteDoc[]): Promise<void> {
    const batch = writeBatch(this.fs);
    for (const d of docs) {
      batch.set(doc(this.col(c), d.uid), { ...stripUndefined(d), synced_at: serverTimestamp() });
    }
    await batch.commit();
  }

  subscribe(
    c: CollectionName,
    sinceMs: number,
    onDocs: (docs: IncomingDoc[]) => void,
    onError: (error: Error) => void,
  ): () => void {
    const q = query(this.col(c), where('synced_at', '>', Timestamp.fromMillis(sinceMs)), orderBy('synced_at'));
    return onSnapshot(
      q,
      (snap) => {
        const out: IncomingDoc[] = [];
        for (const change of snap.docChanges()) {
          if (change.type === 'removed') continue;
          // Our own write that the server hasn't confirmed yet; it comes back once confirmed.
          if (change.doc.metadata.hasPendingWrites) continue;
          const data = change.doc.data();
          const ts = data.synced_at as Timestamp | null | undefined;
          if (!ts) continue;
          out.push({ ...(data as RemoteDoc), uid: change.doc.id, synced_at: ts.toMillis() });
        }
        if (out.length) onDocs(out);
      },
      (e) => onError(e),
    );
  }

  async getAll(c: CollectionName): Promise<RemoteDoc[]> {
    const snap = await getDocs(this.col(c));
    return snap.docs.map((d) => {
      const { synced_at: _ignored, ...data } = d.data();
      return { ...(data as RemoteDoc), uid: d.id };
    });
  }

  async hasData(): Promise<boolean> {
    for (const c of ['orders', 'money'] as const) {
      const snap = await getDocs(query(this.col(c), limit(1)));
      if (!snap.empty) return true;
    }
    return false;
  }
}

/** Firestore rejects `undefined` values. */
function stripUndefined<T extends Record<string, unknown>>(obj: T): T {
  return JSON.parse(JSON.stringify(obj)) as T;
}
