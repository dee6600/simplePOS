import type { SQLiteDatabase } from 'expo-sqlite';

import { getDeviceSetting, setDeviceSetting } from '../db/settings';
import type { RemoteChange } from '../lib/changes';
import { applyIncoming, collectDirty, countDirty, markClean } from './mapping';
import { COLLECTIONS, type CollectionName, type IncomingDoc, type RemoteStore } from './remote';

export type SyncState = 'off' | 'starting' | 'synced' | 'uploading' | 'offline';
export type SyncStatus = { state: SyncState; waiting: number; lastSyncedAt: number | null; error: string | null };

type Options = {
  onStatus?: (status: SyncStatus) => void;
  /**
   * Called after changes from another phone were written locally (screens should reload).
   * After joining a shop, the first download only reports changes from the last few minutes.
   */
  onRemoteChange?: (changes: RemoteChange[]) => void;
  debounceMs?: number;
  retryMs?: number;
};

/** Re-download a little before the saved cursor; applying a doc twice is harmless. */
const CURSOR_OVERLAP_MS = 60_000;
/** On a phone's first download, changes newer than this still raise an alert. */
const QUIET_RECENT_MS = 10 * 60_000;
/** 50 × 400 rows per collection per upload round. */
const MAX_BATCHES_PER_PUSH = 50;

/**
 * Two-way sync between the local SQLite database and the cloud.
 * Upload: rows marked dirty are pushed, then marked clean (dirty rows are the offline queue).
 * Download: a live subscription per collection; newer edits win.
 */
export class SyncEngine {
  private unsubs: (() => void)[] = [];
  private pushTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pushing: Promise<void> | null = null;
  private pushAgain = false;
  private applyChain: Promise<void> = Promise.resolve();
  private running = false;
  /** Collections whose first download is the whole shop (fresh join): don't alert about it. */
  private quietFirst = new Set<CollectionName>();
  private status: SyncStatus = { state: 'off', waiting: 0, lastSyncedAt: null, error: null };

  constructor(
    private db: SQLiteDatabase,
    private remote: RemoteStore,
    private opts: Options = {},
  ) {}

  getStatus(): SyncStatus {
    return this.status;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.setStatus({ state: 'starting', error: null });
    for (const c of COLLECTIONS) {
      const cursor = Number((await getDeviceSetting(this.db, `cursor_${c}`)) ?? 0);
      if (cursor === 0) this.quietFirst.add(c);
      else this.quietFirst.delete(c);
      this.unsubs.push(
        this.remote.subscribe(
          c,
          Math.max(0, cursor - CURSOR_OVERLAP_MS),
          (docs) => this.enqueueApply(c, docs),
          (e) => this.setStatus({ state: 'offline', error: e.message }),
        ),
      );
    }
    await this.pushNow();
  }

  stop(): void {
    this.running = false;
    for (const u of this.unsubs) u();
    this.unsubs = [];
    if (this.pushTimer) clearTimeout(this.pushTimer);
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.pushTimer = this.retryTimer = null;
    this.setStatus({ state: 'off', error: null });
  }

  /** Call after any local change; uploads shortly after (several quick changes go together). */
  schedulePush(): void {
    if (!this.running) return;
    if (this.pushTimer) clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => {
      this.pushTimer = null;
      this.pushNow();
    }, this.opts.debounceMs ?? 300);
  }

  /** Upload everything waiting. Safe to call any time; concurrent calls are merged. */
  pushNow(): Promise<void> {
    if (!this.running) return Promise.resolve();
    if (this.pushing) {
      this.pushAgain = true;
      return this.pushing;
    }
    this.pushing = this.doPush().finally(() => {
      this.pushing = null;
      if (this.pushAgain && this.running) {
        this.pushAgain = false;
        this.pushNow();
      }
    });
    return this.pushing;
  }

  /** Resolves when pending uploads and downloads have been processed (used by tests). */
  async idle(): Promise<void> {
    for (let i = 0; i < 5; i++) {
      await this.applyChain;
      if (this.pushTimer) {
        clearTimeout(this.pushTimer);
        this.pushTimer = null;
        await this.pushNow();
      }
      await this.pushing;
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  private async doPush(): Promise<void> {
    try {
      let waiting = await countDirty(this.db);
      if (waiting > 0) this.setStatus({ state: 'uploading', waiting });
      for (const c of COLLECTIONS) {
        // Capped so a row that somehow never gets marked clean can't loop forever; the rest goes next time.
        for (let batch = 0; batch < MAX_BATCHES_PER_PUSH; batch++) {
          const docs = await collectDirty(this.db, c);
          if (docs.length === 0) break;
          await this.remote.push(c, docs);
          await markClean(this.db, c, docs);
          if (c === 'meta') break; // a single document
        }
      }
      waiting = await countDirty(this.db);
      this.setStatus({ state: 'synced', waiting, lastSyncedAt: Date.now(), error: null });
    } catch (e) {
      const waiting = await countDirty(this.db).catch(() => this.status.waiting);
      this.setStatus({ state: 'offline', waiting, error: e instanceof Error ? e.message : String(e) });
      if (this.running && !this.retryTimer) {
        this.retryTimer = setTimeout(() => {
          this.retryTimer = null;
          this.pushNow();
        }, this.opts.retryMs ?? 15_000);
      }
    }
  }

  private enqueueApply(c: CollectionName, docs: IncomingDoc[]): void {
    this.applyChain = this.applyChain.then(async () => {
      try {
        const { applied, changes } = await applyIncoming(this.db, c, docs);
        const quiet = this.quietFirst.delete(c);
        const cursor = Math.max(
          Number((await getDeviceSetting(this.db, `cursor_${c}`)) ?? 0),
          ...docs.map((d) => d.synced_at),
        );
        await setDeviceSetting(this.db, `cursor_${c}`, String(cursor));
        const waiting = await countDirty(this.db);
        this.setStatus({
          state: waiting > 0 ? this.status.state : 'synced',
          waiting,
          lastSyncedAt: Date.now(),
          error: null,
        });
        if (applied > 0) {
          // The first download after joining is the shop's history; only the last few minutes are news.
          const news = quiet ? changes.filter((ch) => ch.at > Date.now() - QUIET_RECENT_MS) : changes;
          this.opts.onRemoteChange?.(news);
        }
      } catch (e) {
        this.setStatus({ error: e instanceof Error ? e.message : String(e) });
      }
    });
  }

  private setStatus(patch: Partial<SyncStatus>): void {
    this.status = { ...this.status, ...patch };
    this.opts.onStatus?.(this.status);
  }
}
