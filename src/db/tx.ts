import type { SQLiteDatabase } from 'expo-sqlite';

let chain: Promise<unknown> = Promise.resolve();

/**
 * Runs `task` in a transaction, one at a time. With sync on, changes from other phones are written
 * in the background; without this, saving an order at the same moment would fail with
 * "cannot start a transaction within a transaction". Never call withTx from inside another withTx.
 */
export function withTx(db: SQLiteDatabase, task: () => Promise<void>): Promise<void> {
  const run = chain.then(() => db.withTransactionAsync(task));
  chain = run.catch(() => {});
  return run;
}
