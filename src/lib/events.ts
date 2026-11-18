import { useEffect } from 'react';

/** Tiny "data changed" signal so screens that are already open (e.g. after an Undo) reload. */
const listeners = new Set<() => void>();

export function emitDataChanged(): void {
  for (const fn of listeners) fn();
}

/** `callback` should be stable (wrap it in useCallback). */
export function useDataChanged(callback: () => void): void {
  useEffect(() => {
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
    };
  }, [callback]);
}
