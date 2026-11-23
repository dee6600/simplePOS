import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { createContext, Fragment, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { changeTextString, describeChanges, useRemoteChanges, type RemoteChange } from '../lib/changes';
import { colors, radius } from '../theme';
import { Name } from './ByLine';

export type ToastOptions = {
  message: string;
  tone?: 'success' | 'danger' | 'info';
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
};

const ToastContext = createContext<(t: ToastOptions) => void>(() => {});

/**
 * Shows one message at a time at the top of the screen, so it never covers the order buttons.
 * Alerts about other phones' changes appear just below it, so they never hide a "saved · EDIT" or UNDO.
 */
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
      <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + 6 }]}>
        {toast && (
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
        )}
        <ChangeBanner />
      </View>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

const BANNER_MS = 6000;
const changeKey = (c: RemoteChange) => `${c.kind}:${c.localId ?? ''}`;

/** "Order #12 changed by Mom": shown when another family phone's change arrives through sync. */
function ChangeBanner() {
  const [changes, setChanges] = useState<RemoteChange[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  useRemoteChanges(
    useCallback((incoming: RemoteChange[]) => {
      // Changes arriving while the banner is up are added to it; the same record only counts once (newest wins).
      setChanges((cur) => {
        const keys = new Set(incoming.map(changeKey));
        return [...cur.filter((c) => !keys.has(changeKey(c))), ...incoming];
      });
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setChanges([]), BANNER_MS);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    }, []),
  );

  if (changes.length === 0) return null;
  const text = describeChanges(changes);
  const only = changes.length === 1 ? changes[0] : null;
  const opensOrder = only?.kind === 'order' && only.action !== 'deleted' && only.localId != null;
  const opensMoney = changes.every((c) => c.kind === 'money');
  const opensStock = !opensMoney && changes.every((c) => c.kind === 'stock' || c.kind === 'money');

  const open = () => {
    setChanges([]);
    if (opensOrder && only?.localId != null) {
      router.push({ pathname: '/order/[id]', params: { id: String(only.localId) } });
    } else if (opensMoney) {
      router.navigate('/money');
    } else if (opensStock) {
      router.navigate('/stock');
    }
  };

  return (
    <Pressable
      onPress={open}
      style={({ pressed }) => [styles.banner, pressed && { opacity: 0.85 }]}
      accessibilityRole="button"
      accessibilityLabel={changeTextString(text)}
      accessibilityHint={
        opensOrder ? 'Opens the order' : opensMoney ? 'Opens the Money tab' : opensStock ? 'Opens the Stock tab' : 'Hides this alert'
      }
    >
      <View style={styles.bannerBody}>
        <Text style={styles.bannerText} numberOfLines={2}>
          {text.lead}
          {text.names.map((n, i) => (
            <Fragment key={n}>
              {i > 0 ? ' & ' : ''}
              <Name style={styles.bannerName}>{n}</Name>
            </Fragment>
          ))}
          {text.tail}
        </Text>
        {text.detail && (
          <Text style={styles.bannerDetail} numberOfLines={1}>
            {text.detail}
          </Text>
        )}
      </View>
      <Pressable hitSlop={12} onPress={() => setChanges([])} style={styles.close} accessibilityLabel="Hide alert">
        <Text style={[styles.closeText, { color: colors.muted }]}>✕</Text>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 12, right: 12, alignItems: 'center', gap: 8 },
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
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
    maxWidth: 520,
    minHeight: 52,
    paddingLeft: 14,
    paddingRight: 8,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 6,
    borderLeftColor: colors.primary,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  bannerBody: { flex: 1, paddingVertical: 10, gap: 2 },
  bannerText: { fontSize: 16, fontWeight: '600', color: colors.text },
  bannerName: { color: colors.primary },
  bannerDetail: { fontSize: 13, color: colors.muted },
});
