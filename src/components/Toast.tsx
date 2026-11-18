import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius } from '../theme';

export type ToastOptions = {
  message: string;
  tone?: 'success' | 'danger' | 'info';
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
};

const ToastContext = createContext<(t: ToastOptions) => void>(() => {});

/** Shows one message at a time at the top of the screen, so it never covers the order buttons. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [toast, setToast] = useState<(ToastOptions & { id: number }) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const show = useCallback((t: ToastOptions) => {
    clearTimeout(timer.current);
    const id = Date.now();
    setToast({ ...t, id });
    timer.current = setTimeout(
      () => setToast((cur) => (cur?.id === id ? null : cur)),
      t.durationMs ?? (t.onAction ? 6000 : 2500),
    );
  }, []);

  const bg = toast?.tone === 'danger' ? colors.danger : toast?.tone === 'success' ? '#166534' : '#292524';

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + 6 }]}>
          <View style={[styles.toast, { backgroundColor: bg }]}>
            <Text style={styles.message} numberOfLines={2}>
              {toast.message}
            </Text>
            {toast.actionLabel && toast.onAction && (
              <Pressable
                hitSlop={12}
                style={styles.action}
                onPress={() => {
                  const action = toast.onAction;
                  setToast(null);
                  action?.();
                }}
              >
                <Text style={styles.actionText}>{toast.actionLabel}</Text>
              </Pressable>
            )}
            <Pressable hitSlop={12} onPress={() => setToast(null)} style={styles.close}>
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
          </View>
        </View>
      )}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, alignItems: 'center' },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    maxWidth: 520,
    minHeight: 52,
    paddingLeft: 16,
    paddingRight: 8,
    borderRadius: radius.md,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  message: { flex: 1, color: colors.white, fontSize: 16, fontWeight: '600', paddingVertical: 12 },
  action: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: radius.sm, backgroundColor: 'rgba(255,255,255,0.18)' },
  actionText: { color: colors.white, fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
  close: { padding: 8 },
  closeText: { color: 'rgba(255,255,255,0.7)', fontSize: 16 },
});
