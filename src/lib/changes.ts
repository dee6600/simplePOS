import { useEffect } from 'react';

/** Something another family phone added, changed or deleted, as seen when it arrives through sync. */
export type ChangeKind = 'order' | 'money' | 'menu' | 'settings' | 'stock';
export type ChangeAction = 'added' | 'edited' | 'deleted' | 'restored';

export type RemoteChange = {
  kind: ChangeKind;
  action: ChangeAction;
  /** Row id on this phone (orders and money entries), so the alert can open it. */
  localId: number | null;
  /** Who did it ("Mom"); '' when unknown (e.g. changed on a phone still running v1.3). */
  actor: string;
  /** "Order #12", "Expense ₹500 · Rice", "Chicken 65", "Shop settings". */
  label: string;
  /** When it was changed (that phone's clock, ms). */
  at: number;
};

const ACTION_WORD: Record<ChangeAction, string> = {
  added: 'added',
  edited: 'changed',
  deleted: 'deleted',
  restored: 'restored',
};

/** Text for an alert, split so the screen can show the names in bold. */
export type ChangeText = {
  /** Before the names: "Order #12 changed by " / "5 updates from ". */
  lead: string;
  /** The people, shown bold. Empty when nobody is known. */
  names: string[];
  /** After the names: "" or " on another phone". */
  tail: string;
  /** For several changes: the newest one, e.g. "Latest: Order #14 added by Mom". */
  detail: string | null;
};

function one(c: RemoteChange): ChangeText {
  const what = `${c.label} ${ACTION_WORD[c.action]}`;
  return c.actor
    ? { lead: `${what} by `, names: [c.actor], tail: '', detail: null }
    : { lead: what, names: [], tail: ' on another phone', detail: null };
}

/** "Order #12 changed by Mom", or "5 updates from Mom & Shree" with the newest one as a detail line. */
export function describeChanges(changes: RemoteChange[]): ChangeText {
  if (changes.length === 1) return one(changes[0]);
  const names = [...new Set(changes.map((c) => c.actor).filter(Boolean))];
  const latest = changes[changes.length - 1];
  const l = one(latest);
  return {
    lead: `${changes.length} updates${names.length ? ' from ' : ''}`,
    names,
    tail: names.length ? '' : ' from other phones',
    detail: `Latest: ${l.lead}${l.names.join('')}${l.tail}`,
  };
}

/** The same text as one plain string (for screen readers and tests). */
export function changeTextString(t: ChangeText): string {
  return `${t.lead}${t.names.join(' & ')}${t.tail}`;
}

// ---- Tiny signal, like lib/events.ts: the sync engine emits, the alert banner listens. ----

const listeners = new Set<(changes: RemoteChange[]) => void>();

export function emitRemoteChanges(changes: RemoteChange[]): void {
  if (changes.length === 0) return;
  for (const fn of listeners) fn(changes);
}

/** `callback` should be stable (wrap it in useCallback). */
export function useRemoteChanges(callback: (changes: RemoteChange[]) => void): void {
  useEffect(() => {
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
    };
  }, [callback]);
}
