import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useMemo, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import type { OrderInput } from '../db/orders';
import { formatRupees, linesCount, linesTotal } from '../lib/format';
import type { MenuItem, Order, OrderLine, OrderType, Status } from '../lib/types';
import { colors, ITEM_COLORS, radius, STATUS } from '../theme';
import { ItemTile } from './ItemTile';
import { Segmented } from './Segmented';

type CartLine = OrderLine & { key: string };
type Tile = { key: string; menu_item_id: number | null; name: string; price: number; color: string };

type Props = {
  /** Active menu items, in display order. */
  menu: MenuItem[];
  showOrderType: boolean;
  /** Set when editing an existing order. */
  initial?: Order;
  /** Extra bottom padding (safe area) when there is no tab bar below the editor. */
  bottomInset?: number;
  onSubmit: (input: OrderInput) => Promise<void>;
};

const STATUS_ICONS = {
  pending: 'time-outline',
  cash: 'cash-outline',
  upi: 'qr-code-outline',
} as const;

const keyFor = (menuItemId: number | null, fallback: string) => (menuItemId != null ? `m${menuItemId}` : fallback);

function initialLines(order?: Order): CartLine[] {
  const out: CartLine[] = [];
  order?.items.forEach((l, i) => {
    const key = keyFor(l.menu_item_id, `x${i}`);
    const existing = out.find((c) => c.key === key);
    if (existing) existing.qty += l.qty;
    else out.push({ ...l, key });
  });
  return out;
}

export function OrderEditor({ menu, showOrderType, initial, bottomInset = 0, onSubmit }: Props) {
  const isEdit = !!initial;
  const [lines, setLines] = useState<CartLine[]>(() => initialLines(initial));
  const [orderType, setOrderType] = useState<OrderType>(initial?.order_type ?? null);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false); // blocks double taps before the re-render lands
  const { width } = useWindowDimensions();

  const columns = width >= 900 ? 4 : width >= 600 ? 3 : 2;
  const gap = 10;
  const tileWidth = Math.floor((width - 16 * 2 - gap * (columns - 1)) / columns);

  // Menu tiles, plus tiles for items in this order that are no longer on the menu (so they can be removed).
  const tiles = useMemo<Tile[]>(() => {
    const t: Tile[] = menu.map((m) => ({
      key: `m${m.id}`, menu_item_id: m.id, name: m.name, price: m.price, color: m.color,
    }));
    const known = new Set(t.map((x) => x.key));
    for (const l of lines) {
      if (!known.has(l.key)) {
        t.push({ key: l.key, menu_item_id: l.menu_item_id, name: l.name, price: l.price, color: ITEM_COLORS[9] });
        known.add(l.key);
      }
    }
    return t;
  }, [menu, lines]);

  const count = linesCount(lines);
  const total = linesTotal(lines);

  const add = (tile: Tile) => {
    Haptics.selectionAsync().catch(() => {});
    setLines((prev) => {
      const i = prev.findIndex((l) => l.key === tile.key);
      if (i === -1) {
        return [...prev, { key: tile.key, menu_item_id: tile.menu_item_id, name: tile.name, price: tile.price, qty: 1 }];
      }
      const next = [...prev];
      next[i] = { ...next[i], qty: next[i].qty + 1 };
      return next;
    });
  };

  const remove = (key: string) => {
    Haptics.selectionAsync().catch(() => {});
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, qty: l.qty - 1 } : l)).filter((l) => l.qty > 0));
  };

  const submit = async (status: Status) => {
    if (savingRef.current || count === 0) return;
    savingRef.current = true;
    setSaving(true);
    try {
      await onSubmit({
        lines: lines.map(({ key: _key, ...line }) => line),
        status,
        orderType,
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      if (!isEdit) {
        setLines([]);
        setOrderType(null);
      }
    } catch (e) {
      Alert.alert('Could not save order', e instanceof Error ? e.message : String(e));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <View style={styles.flex}>
      <ScrollView contentContainerStyle={[styles.grid, { gap }]} keyboardShouldPersistTaps="handled">
        {tiles.map((t) => {
          const line = lines.find((l) => l.key === t.key);
          return (
            <ItemTile
              key={t.key}
              name={t.name}
              price={line?.price ?? t.price}
              color={t.color}
              qty={line?.qty ?? 0}
              width={tileWidth}
              onAdd={() => add(t)}
              onRemove={() => remove(t.key)}
            />
          );
        })}
        {tiles.length === 0 && (
          <Text style={styles.empty}>No items on the menu yet. Add them in Settings → Menu.</Text>
        )}
      </ScrollView>

      <View style={[styles.panel, { paddingBottom: 12 + bottomInset }]}>
        {(showOrderType || orderType) && (
          <Segmented<'dine_in' | 'parcel'>
            options={[
              { value: 'dine_in', label: 'Dine-in' },
              { value: 'parcel', label: 'Parcel' },
            ]}
            value={orderType}
            onChange={setOrderType}
            onClear={() => setOrderType(null)}
          />
        )}

        <View style={styles.totalRow}>
          <Text style={styles.count}>
            {count === 0 ? 'Tap items to add' : `${count} item${count === 1 ? '' : 's'}`}
          </Text>
          {!isEdit && count > 0 && (
            <Pressable
              onPress={() => {
                setLines([]);
                setOrderType(null);
              }}
              hitSlop={10}
              style={styles.clear}
            >
              <Ionicons name="close-circle" size={18} color={colors.muted} />
              <Text style={styles.clearText}>Clear</Text>
            </Pressable>
          )}
          <Text style={styles.total} maxFontSizeMultiplier={1.3}>
            {formatRupees(total)}
          </Text>
        </View>

        {isEdit && <Text style={styles.saveAs}>Save as</Text>}
        <View style={styles.buttons}>
          {(['pending', 'cash', 'upi'] as const).map((s) => {
            const disabled = count === 0 || saving;
            const current = isEdit && initial?.status === s;
            return (
              <Pressable
                key={s}
                disabled={disabled}
                onPress={() => submit(s)}
                accessibilityRole="button"
                accessibilityLabel={`${isEdit ? 'Save as' : 'Save order as'} ${STATUS[s].button}`}
                style={({ pressed }) => [
                  styles.statusBtn,
                  { backgroundColor: disabled ? colors.disabled : STATUS[s].color },
                  current && styles.currentBtn,
                  pressed && { opacity: 0.8 },
                ]}
              >
                <Ionicons name={current ? 'checkmark-circle' : STATUS_ICONS[s]} size={24} color={colors.white} />
                <Text style={styles.statusText} numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1.2}>
                  {STATUS[s].button}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: 16, paddingTop: 4 },
  empty: { fontSize: 17, color: colors.muted, padding: 24, textAlign: 'center' },
  panel: {
    backgroundColor: colors.card,
    paddingHorizontal: 16,
    paddingTop: 12,
    gap: 10,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -3 },
    elevation: 12,
  },
  totalRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  count: { fontSize: 17, color: colors.muted, fontWeight: '600' },
  clear: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.bg,
  },
  clearText: { fontSize: 15, color: colors.muted, fontWeight: '700' },
  total: { marginLeft: 'auto', fontSize: 30, fontWeight: '900', color: colors.text },
  saveAs: { fontSize: 14, fontWeight: '700', color: colors.muted, marginBottom: -4 },
  buttons: { flexDirection: 'row', gap: 8 },
  statusBtn: {
    flex: 1,
    height: 68,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 4,
  },
  currentBtn: { borderWidth: 3, borderColor: colors.text },
  statusText: { color: colors.white, fontSize: 17, fontWeight: '800' },
});
