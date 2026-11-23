/** What the sync engine needs from the cloud. Firestore implements it; tests use an in-memory fake. */

export type CollectionName = 'menu_items' | 'orders' | 'money' | 'meta' | 'stock_items' | 'stock';
/** stock_items / stock were added in v1.5; older app versions don't know them and leave them alone. */
export const COLLECTIONS: CollectionName[] = ['menu_items', 'orders', 'money', 'meta', 'stock_items', 'stock'];

/** A synced record. `uid` is the document id; `updated_at` (phone time) decides which edit wins. */
export type RemoteDoc = { uid: string; updated_at: number; [field: string]: unknown };
/** A record as received from the cloud. `synced_at` is server time, used as the download cursor. */
export type IncomingDoc = RemoteDoc & { synced_at: number };

export interface RemoteStore {
  /** Upserts docs by uid and stamps each with the server time. */
  push(collection: CollectionName, docs: RemoteDoc[]): Promise<void>;
  /** Streams docs whose server time is after `sinceMs`, now and as they change. Returns an unsubscribe. */
  subscribe(
    collection: CollectionName,
    sinceMs: number,
    onDocs: (docs: IncomingDoc[]) => void,
    onError: (error: Error) => void,
  ): () => void;
  /** True if the shop already has orders or money entries in the cloud (a menu alone doesn't count). */
  hasData(): Promise<boolean>;
  /** Every document in a collection (used once, when a phone sets up the shop). */
  getAll(collection: CollectionName): Promise<RemoteDoc[]>;
}
