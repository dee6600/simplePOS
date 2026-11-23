import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ByLine } from '../../components/ByLine';
import { PeriodNav } from '../../components/PeriodNav';
import { ScreenHeader } from '../../components/ScreenHeader';
import { STOCK_KIND_COLOR, StockEntryModal, type StockModalTarget } from '../../components/StockEntryModal';
import { useToast } from '../../components/Toast';
import { listMenu } from '../../db/menu';
import { listOrders } from '../../db/orders';
import {
  addStockEntry, getStockLevels, listStockEntries, listStockItems, setStockEntryDeleted, updateStockEntry,
} from '../../db/stock';
import { formatDayShort, periodLabel, periodRange, shiftPeriod } from '../../lib/dates';
import { emitDataChanged, useDataChanged } from '../../lib/events';
import { formatRupees, formatTime } from '../../lib/format';
import {
  formatGrams, formatQty, kindLabel, platesFor, platesText, soldQty, totalsByItem, totalsFor, type ItemTotals,
} from '../../lib/stock';
import { summarize, type ItemTotal } from '../../lib/summary';
import type { StockEntry, StockItem, StockKind } from '../../lib/types';
import { useSync } from '../../sync/SyncProvider';
import { colors, radius } from '../../theme';

export default function StockScreen() {
  const db = useSQLiteContext();
  const toast = useToast();
  const { userName } = useSync();
  const [dayOffset, setDayOffset] = useState(0);
  const [items, setItems] = useState<StockItem[]>([]);
  const [allItems, setAllItems] = useState<Map<string, StockItem>>(new Map());
  const [entries, setEntries] = useState<StockEntry[]>([]);
  const [levels, setLevels] = useState<Map<string, number>>(new Map());
  const [sold, setSold] = useState<ItemTotal[]>([]);
  const [target, setTarget] = useState<StockModalTarget>(null);
  const requestId = useRef(0);

  const anchor = shiftPeriod('day', new Date(), dayOffset);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    const range = periodRange('day', shiftPeriod('day', new Date(), dayOffset));
    const [active, everything, list, lv, orders, menu] = await Promise.all([
      listStockItems(db, { activeOnly: true }),
      listStockItems(db, { includeDeleted: true }),
      listStockEntries(db, range),
      getStockLevels(db),
      listOrders(db, range),
      listMenu(db),
    ]);
    if (id !== requestId.current) return;
    setItems(active);
    setAllItems(new Map(everything.map((i) => [i.uid, i])));
    setEntries(list);
    setLevels(lv);
    setSold(summarize(orders, menu.map((m) => m.id)).items);
  }, [db, dayOffset]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  useDataChanged(load);

  const totals = totalsByItem(entries);
  const cooked = items.filter((i) => i.grp === 'cooked');
  const home = items.filter((i) => i.grp === 'home');
  const daily = items.filter((i) => i.grp === 'daily');
  const open = (item: StockItem, kind: StockKind) => setTarget({ item, kind });

  /** New entries go on the day being looked at: today now, or late on an earlier day (e.g. last night's leftover). */
  const entryTime = () => {
    if (dayOffset === 0) return Date.now();
    const d = shiftPeriod('day', new Date(), dayOffset);
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59).getTime();
  };

  const remove = async (entry: StockEntry) => {
    const item = allItems.get(entry.item_uid);
    await setStockEntryDeleted(db, entry, true);
    emitDataChanged();
    toast({
      tone: 'danger',
      message: `${item?.name ?? 'Entry'} ${entryAmount(entry, item)} deleted`,
      actionLabel: 'UNDO',
      onAction: async () => {
        await setStockEntryDeleted(db, entry, false);
        emitDataChanged();
      },
    });
  };

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Stock" />
      <ScrollView contentContainerStyle={styles.content}>
        <PeriodNav
          label={periodLabel('day', anchor)}
          onPrev={() => setDayOffset((d) => d - 1)}
          onNext={() => setDayOffset((d) => Math.min(0, d + 1))}
          nextDisabled={dayOffset >= 0}
          onReset={dayOffset !== 0 ? () => setDayOffset(0) : undefined}
        />

        {cooked.map((item) => (
          <CookedCard key={item.uid} item={item} t={totalsFor(totals, item.uid)} plates={platesText(platesFor(item.name, sold))} onAdd={open} />
        ))}

        {home.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Kept at home</Text>
            <Text style={styles.hint}>In stock now = bought − sent to shop</Text>
            {home.map((item) => {
              const level = levels.get(item.uid) ?? 0;
              const low = item.low_level != null && level <= item.low_level;
              const t = totalsFor(totals, item.uid);
              const day = [t.in && `+${formatQty(t.in, item.unit)} bought`, t.out && `−${formatQty(t.out, item.unit)} sent`]
                .filter(Boolean)
                .join(' · ');
              return (
                <ItemRow
                  key={item.uid}
                  name={item.name}
                  value={formatQty(level, item.unit)}
                  valueColor={low ? colors.danger : colors.text}
                  sub={[low ? 'Low, buy more' : '', day].filter(Boolean).join(' · ')}
                  subColor={low ? colors.danger : undefined}
                  onPress={() => open(item, 'out')}
                />
              );
            })}
          </View>
        )}

        {daily.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Bought {dayOffset === 0 ? 'today' : 'this day'}</Text>
            {daily.map((item) => {
              const t = totalsFor(totals, item.uid);
              return (
                <ItemRow
                  key={item.uid}
                  name={item.name}
                  value={t.in ? formatQty(t.in, item.unit) : '—'}
                  valueColor={t.in ? colors.text : colors.muted}
                  onPress={() => open(item, 'in')}
                />
              );
            })}
          </View>
        )}

        {entries.length > 0 && <Text style={styles.sectionTitle}>Entries on this day</Text>}
        {entries.map((e) => {
          const item = allItems.get(e.item_uid);
          return (
            <Pressable
              key={e.uid}
              onPress={() => item && setTarget({ item, kind: e.kind, entry: e })}
              style={({ pressed }) => [styles.entry, pressed && { opacity: 0.8 }]}
              accessibilityHint="Opens the entry to edit or delete"
            >
              <View style={[styles.entryDot, { backgroundColor: STOCK_KIND_COLOR[e.kind] ?? colors.muted }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.entryTitle} numberOfLines={1}>
                  {item?.name ?? 'Deleted item'}
                  <Text style={styles.entryKind}>  {item ? kindLabel(item.grp, e.kind) : e.kind}</Text>
                </Text>
                {e.note ? (
                  <Text style={styles.entryNote} numberOfLines={2}>
                    {e.note}
                  </Text>
                ) : null}
                <Text style={styles.entryWho}>
                  {formatTime(e.created_at)} · <ByLine createdBy={e.created_by} updatedBy={e.updated_by} />
                  {e.paid_amount != null ? ` · paid ${formatRupees(e.paid_amount)} ${e.paid_method === 'cash' ? 'Cash' : 'UPI'}` : ''}
                </Text>
              </View>
              <Text style={[styles.entryAmount, { color: STOCK_KIND_COLOR[e.kind] ?? colors.text }]}>{entryAmount(e, item)}</Text>
            </Pressable>
          );
        })}
        {entries.length === 0 && <Text style={styles.empty}>Nothing added on this day yet.</Text>}

        <Pressable onPress={() => router.push('/stock-items')} style={styles.editBtn} accessibilityRole="button">
          <Ionicons name="create-outline" size={20} color={colors.primary} />
          <Text style={styles.editText}>Edit stock items</Text>
        </Pressable>
      </ScrollView>

      <StockEntryModal
        target={target}
        userName={userName ?? ''}
        dayNote={dayOffset !== 0 ? formatDayShort(anchor) : undefined}
        onClose={() => setTarget(null)}
        onSave={async (item, input, entry) => {
          if (entry) await updateStockEntry(db, entry, item, input);
          else await addStockEntry(db, item, input, entryTime());
          emitDataChanged();
          await load();
          const amount = input.kind === 'staff' ? formatGrams(input.qty) : formatQty(input.qty, item.unit);
          toast({
            tone: 'success',
            message: `${entry ? 'Updated' : 'Saved'}: ${item.name} ${kindLabel(item.grp, input.kind).toLowerCase()} ${amount}${
              input.paid ? ` · expense ${formatRupees(input.paid.amount)}` : ''
            }`,
          });
        }}
        onDelete={remove}
      />
    </View>
  );
}

function entryAmount(e: StockEntry, item: StockItem | undefined): string {
  if (e.kind === 'staff') return formatGrams(e.qty);
  const sign = e.kind === 'out' ? '−' : e.kind === 'in' ? '+' : '';
  return `${sign}${formatQty(e.qty, item?.unit ?? '')}`;
}

function CookedCard({
  item, t, plates, onAdd,
}: { item: StockItem; t: ItemTotals; plates: string | null; onAdd: (item: StockItem, kind: StockKind) => void }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{item.name}</Text>
      <View style={styles.statRow}>
        <Stat label="Cooked" value={formatQty(t.in, item.unit)} />
        <Stat label="Left" value={formatQty(t.left, item.unit)} />
        <Stat label={t.staffCount ? `Staff (${t.staffCount})` : 'Staff'} value={formatGrams(t.staff)} />
        <Stat label="Sold ≈" value={formatQty(t.in ? soldQty(t) : 0, item.unit)} strong />
      </View>
      {plates && <Text style={styles.hint}>Plates sold: {plates}</Text>}
      <View style={styles.btnRow}>
        {(['in', 'left', 'staff'] as const).map((k) => (
          <Pressable
            key={k}
            onPress={() => onAdd(item, k)}
            style={({ pressed }) => [styles.addBtn, { backgroundColor: STOCK_KIND_COLOR[k] }, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
            accessibilityLabel={`Add ${kindLabel('cooked', k)} for ${item.name}`}
          >
            <Text style={styles.addText} numberOfLines={1} adjustsFontSizeToFit>
              + {kindLabel('cooked', k)}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={[styles.stat, strong && { backgroundColor: colors.text }]}>
      <Text style={[styles.statLabel, strong && { color: 'rgba(255,255,255,0.8)' }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[styles.statValue, strong && { color: colors.white }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

function ItemRow({
  name, value, valueColor, sub, subColor, onPress,
}: { name: string; value: string; valueColor: string; sub?: string; subColor?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.itemRow, pressed && { opacity: 0.6 }]} accessibilityRole="button">
      <View style={{ flex: 1 }}>
        <Text style={styles.itemName}>{name}</Text>
        {sub ? <Text style={[styles.itemSub, subColor && { color: subColor, fontWeight: '800' }]}>{sub}</Text> : null}
      </View>
      <Text style={[styles.itemValue, { color: valueColor }]}>{value}</Text>
      <View style={styles.plus}>
        <Ionicons name="add" size={22} color={colors.white} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingTop: 4, gap: 12, paddingBottom: 40 },
  card: { backgroundColor: colors.card, borderRadius: radius.md, padding: 14, borderWidth: 1, borderColor: colors.border, gap: 6 },
  cardTitle: { fontSize: 18, fontWeight: '900', color: colors.text },
  hint: { fontSize: 14, color: colors.muted, fontWeight: '600' },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: colors.text, marginTop: 4 },
  statRow: { flexDirection: 'row', gap: 6 },
  stat: { flex: 1, backgroundColor: colors.bg, borderRadius: radius.sm, paddingVertical: 8, paddingHorizontal: 6, alignItems: 'center' },
  statLabel: { fontSize: 12, fontWeight: '800', color: colors.muted },
  statValue: { fontSize: 17, fontWeight: '900', color: colors.text, marginTop: 2 },
  btnRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  addBtn: { flex: 1, height: 50, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  addText: { color: colors.white, fontSize: 16, fontWeight: '800' },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    minHeight: 52,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  itemName: { fontSize: 17, fontWeight: '700', color: colors.text },
  itemSub: { fontSize: 13, color: colors.muted, marginTop: 1 },
  itemValue: { fontSize: 18, fontWeight: '900' },
  plus: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
  entryDot: { width: 14, height: 14, borderRadius: 7 },
  entryTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  entryKind: { fontSize: 13, fontWeight: '700', color: colors.muted },
  entryNote: { fontSize: 15, color: colors.text, marginTop: 2 },
  entryWho: { fontSize: 14, color: colors.muted, marginTop: 3 },
  entryAmount: { fontSize: 18, fontWeight: '900' },
  empty: { textAlign: 'center', color: colors.muted, fontSize: 16, marginTop: 8 },
  editBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  editText: { fontSize: 16, fontWeight: '800', color: colors.primary },
});
