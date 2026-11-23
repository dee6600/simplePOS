import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { DatePickerModal } from '../../components/DatePickerModal';
import { PeriodNav } from '../../components/PeriodNav';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Segmented } from '../../components/Segmented';
import { listMenu } from '../../db/menu';
import { getBalanceSums, listMoneyEntries } from '../../db/money';
import { listOrders } from '../../db/orders';
import { DEFAULT_SETTINGS, getSettings } from '../../db/settings';
import { listStockEntries, listStockItems } from '../../db/stock';
import { computeBalance, type Balance } from '../../lib/balance';
import {
  customLabel, customRange, formatDayMonth, formatDayShort, isLatestPeriod, periodLabel, periodRange, periodStart, shiftPeriod,
  type Period,
} from '../../lib/dates';
import { useDataChanged } from '../../lib/events';
import { formatRupees } from '../../lib/format';
import { kitchenLines, totalsByItem } from '../../lib/stock';
import { summarize, summaryText, type Summary } from '../../lib/summary';
import type { Settings, StockItem } from '../../lib/types';
import { colors, radius, STATUS } from '../../theme';

type ViewKind = Period | 'custom';

const RESET_LABEL: Record<Period, string> = { day: 'Today', week: 'This week', month: 'This month' };

export default function SummaryScreen() {
  const db = useSQLiteContext();
  const [period, setPeriod] = useState<ViewKind>('day');
  const [offset, setOffset] = useState(0);
  // Custom range: the 1st of this month to today until changed.
  const [from, setFrom] = useState(() => periodStart('month', new Date()));
  const [to, setTo] = useState(() => periodStart('day', new Date()));
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [kitchen, setKitchen] = useState<{ item: StockItem; text: string }[]>([]);
  const requestId = useRef(0);

  const navPeriod: Period = period === 'custom' ? 'day' : period;
  const anchor = shiftPeriod(navPeriod, new Date(), offset);
  const label = period === 'custom' ? customLabel(from, to) : periodLabel(period, anchor);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    const range = period === 'custom' ? customRange(from, to) : periodRange(period, shiftPeriod(period, new Date(), offset));
    const [orders, menu, s, entries, sums, stockItems, stockEntries] = await Promise.all([
      listOrders(db, range), listMenu(db), getSettings(db), listMoneyEntries(db, range), getBalanceSums(db),
      listStockItems(db), listStockEntries(db, range),
    ]);
    if (id !== requestId.current) return;
    setSummary(summarize(orders, menu.map((m) => m.id), entries));
    setBalance(computeBalance(sums));
    setSettings(s);
    setKitchen(kitchenLines(stockItems, totalsByItem(stockEntries)));
  }, [db, period, offset, from, to]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  useDataChanged(load);

  const openDay = (date: Date) => {
    const today = periodStart('day', new Date()).getTime();
    setPeriod('day');
    setOffset(Math.round((date.getTime() - today) / 86_400_000));
  };

  const share = () => {
    if (!summary) return;
    Share.share({
      message: summaryText(summary, {
        restaurantName: settings.restaurantName,
        periodLabel: label,
        showOrderType: settings.showOrderType,
        showDays: period !== 'day',
        balance: balance ?? undefined,
        kitchen: kitchen.map((k) => `${k.item.name}: ${k.text}`),
      }),
    }).catch(() => {});
  };

  const s = summary;

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader
        title="Summary"
        right={
          <Pressable onPress={share} style={styles.shareBtn} hitSlop={6} accessibilityLabel="Share summary">
            <Ionicons name="share-outline" size={20} color={colors.primary} />
            <Text style={styles.shareText}>Share</Text>
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={styles.content}>
        <Segmented<ViewKind>
          options={[
            { value: 'day', label: 'Day' },
            { value: 'week', label: 'Week' },
            { value: 'month', label: 'Month' },
            { value: 'custom', label: 'Dates' },
          ]}
          value={period}
          onChange={(p) => {
            setPeriod(p);
            setOffset(0);
          }}
        />
        {period === 'custom' ? (
          <View style={styles.rangeRow}>
            <DateButton label="From" date={from} onPress={() => setPicking('from')} />
            <DateButton label="To" date={to} onPress={() => setPicking('to')} />
          </View>
        ) : (
          <PeriodNav
            label={label}
            onPrev={() => setOffset((o) => o - 1)}
            onNext={() => setOffset((o) => o + 1)}
            nextDisabled={isLatestPeriod(period, anchor)}
            onReset={offset !== 0 ? () => setOffset(0) : undefined}
            resetLabel={RESET_LABEL[period]}
          />
        )}

        {s && (
          <>
            <View style={styles.hero}>
              <Text style={styles.heroLabel}>Total sales</Text>
              <Text style={styles.heroValue} maxFontSizeMultiplier={1.3}>
                {formatRupees(s.total)}
              </Text>
              <Text style={styles.heroSub}>
                {s.orderCount} order{s.orderCount === 1 ? '' : 's'} · {s.itemCount} item{s.itemCount === 1 ? '' : 's'}
              </Text>
            </View>

            <View style={styles.statRow}>
              <Stat label="Cash" value={s.cash} count={s.cashCount} color={STATUS.cash.color} bg={STATUS.cash.bg} />
              <Stat label="UPI" value={s.upi} count={s.upiCount} color={STATUS.upi.color} bg={STATUS.upi.bg} />
            </View>

            <View style={styles.statRow}>
              <Stat label="Expenses" value={s.expenses} count={s.expenseCount} color="#B91C1C" bg="#FEE2E2" unit="entry" />
              <View style={[styles.stat, styles.profit]}>
                <Text style={[styles.statLabel, { color: colors.white }]}>Profit (sales + added − expenses)</Text>
                <Text style={[styles.statValue, { color: s.profit < 0 ? '#FCA5A5' : colors.white }]} numberOfLines={1} adjustsFontSizeToFit>
                  {formatRupees(s.profit)}
                </Text>
              </View>
            </View>

            <View style={styles.statRow}>
              <AfterStat label="Cash in hand after expenses" value={s.cashAfterExpenses} spent={s.cashExpenses} color={STATUS.cash.color} bg={STATUS.cash.bg} />
              <AfterStat label="UPI after expenses" value={s.upiAfterExpenses} spent={s.bankExpenses} color={STATUS.upi.color} bg={STATUS.upi.bg} />
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Plates / items sold</Text>
              {s.items.length === 0 ? (
                <Text style={styles.muted}>No sales in this period.</Text>
              ) : (
                s.items.map((it) => (
                  <View key={it.key} style={styles.itemRow}>
                    <Text style={styles.itemName} numberOfLines={2}>
                      {it.name}
                    </Text>
                    <Text style={styles.itemQty}>× {it.qty}</Text>
                    <Text style={styles.itemAmount}>{formatRupees(it.amount)}</Text>
                  </View>
                ))
              )}
            </View>

            {settings.showOrderType && s.orderCount > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Dine-in / Parcel</Text>
                <View style={styles.itemRow}>
                  <Text style={styles.itemName}>Dine-in</Text>
                  <Text style={styles.itemAmount}>{s.dineIn}</Text>
                </View>
                <View style={styles.itemRow}>
                  <Text style={styles.itemName}>Parcel</Text>
                  <Text style={styles.itemAmount}>{s.parcel}</Text>
                </View>
                {s.untagged > 0 && (
                  <View style={styles.itemRow}>
                    <Text style={[styles.itemName, styles.muted]}>Not marked</Text>
                    <Text style={[styles.itemAmount, styles.muted]}>{s.untagged}</Text>
                  </View>
                )}
              </View>
            )}

            {s.expenseCount > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Expenses</Text>
                {s.expensesByCategory.map((c) => (
                  <View key={c.category} style={styles.itemRow}>
                    <Text style={styles.itemName}>{c.category}</Text>
                    <Text style={styles.itemQty}>{c.count}×</Text>
                    <Text style={styles.itemAmount}>{formatRupees(c.amount)}</Text>
                  </View>
                ))}
              </View>
            )}

            {kitchen.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Kitchen</Text>
                {kitchen.map((k) => (
                  <View key={k.item.uid} style={styles.kitchenRow}>
                    <Text style={styles.itemName}>{k.item.name}</Text>
                    <Text style={styles.kitchenText}>{k.text}</Text>
                  </View>
                ))}
              </View>
            )}

            {(s.moneyIn > 0 || s.moneyOut > 0) && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Lump sums</Text>
                <View style={styles.itemRow}>
                  <Text style={styles.itemName}>Money added</Text>
                  <Text style={[styles.itemAmount, { color: '#15803D' }]}>+{formatRupees(s.moneyIn)}</Text>
                </View>
                <View style={styles.itemRow}>
                  <Text style={styles.itemName}>Money taken out</Text>
                  <Text style={styles.itemAmount}>−{formatRupees(s.moneyOut)}</Text>
                </View>
                <Text style={styles.muted}>Money added counts as profit; money taken out does not. See the Money tab for who added each one.</Text>
              </View>
            )}

            {balance && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Balance now</Text>
                <View style={styles.itemRow}>
                  <Text style={styles.itemName}>Cash in hand</Text>
                  <Text style={styles.itemAmount}>{formatRupees(balance.cash)}</Text>
                </View>
                <View style={styles.itemRow}>
                  <Text style={styles.itemName}>Bank (UPI)</Text>
                  <Text style={styles.itemAmount}>{formatRupees(balance.bank)}</Text>
                </View>
                <View style={styles.itemRow}>
                  <Text style={[styles.itemName, { fontWeight: '900' }]}>Total</Text>
                  <Text style={[styles.itemAmount, { fontWeight: '900' }]}>{formatRupees(balance.total)}</Text>
                </View>
              </View>
            )}

            {period !== 'day' && s.days.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Day by day</Text>
                {s.days.map((d) => (
                  <Pressable
                    key={d.key}
                    onPress={() => openDay(d.date)}
                    style={({ pressed }) => [styles.itemRow, pressed && { opacity: 0.6 }]}
                  >
                    <Text style={styles.itemName}>{formatDayShort(d.date)}</Text>
                    <Text style={styles.itemQty}>{d.orderCount} orders</Text>
                    <View>
                      <Text style={styles.itemAmount}>{formatRupees(d.total)}</Text>
                      {d.expenses > 0 && <Text style={styles.dayExpense}>−{formatRupees(d.expenses)}</Text>}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                  </Pressable>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      <DatePickerModal
        value={picking === 'from' ? from : picking === 'to' ? to : null}
        title={picking === 'from' ? 'From' : 'To'}
        maxDate={new Date()}
        onClose={() => setPicking(null)}
        onPick={(d) => {
          // Keep From ≤ To: moving one past the other moves both.
          if (picking === 'from') {
            setFrom(d);
            if (d > to) setTo(d);
          } else {
            setTo(d);
            if (d < from) setFrom(d);
          }
          setPicking(null);
        }}
      />
    </View>
  );
}

function DateButton({ label, date, onPress }: { label: string; date: Date; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.dateBtn, pressed && { opacity: 0.7 }]} accessibilityRole="button">
      <Text style={styles.dateLabel}>{label}</Text>
      <View style={styles.dateValueRow}>
        <Ionicons name="calendar-outline" size={18} color={colors.primary} />
        <Text style={styles.dateValue}>{formatDayMonth(date)}</Text>
      </View>
    </Pressable>
  );
}

/** Sales of one kind (cash or UPI) minus the expenses paid that way. */
function AfterStat({ label, value, spent, color, bg }: { label: string; value: number; spent: number; color: string; bg: string }) {
  return (
    <View style={[styles.stat, { backgroundColor: bg }]}>
      <Text style={[styles.statLabel, { color }]}>{label}</Text>
      <Text style={[styles.statValue, { color: value < 0 ? colors.danger : color }]} numberOfLines={1} adjustsFontSizeToFit>
        {formatRupees(value)}
      </Text>
      <Text style={[styles.statCount, { color }]}>{spent ? `after −${formatRupees(spent)} spent` : 'nothing spent'}</Text>
    </View>
  );
}

function Stat({
  label, value, count, color, bg, unit = 'order',
}: { label: string; value: number; count: number; color: string; bg: string; unit?: 'order' | 'entry' }) {
  const units = unit === 'entry' ? (count === 1 ? 'entry' : 'entries') : count === 1 ? 'order' : 'orders';
  return (
    <View style={[styles.stat, { backgroundColor: bg }]}>
      <Text style={[styles.statLabel, { color }]}>{label}</Text>
      <Text style={[styles.statValue, { color }]} numberOfLines={1} adjustsFontSizeToFit>
        {formatRupees(value)}
      </Text>
      <Text style={[styles.statCount, { color }]}>{count} {units}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingTop: 4, gap: 12, paddingBottom: 40 },
  shareBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, height: 44, borderRadius: radius.sm, backgroundColor: colors.card },
  shareText: { color: colors.primary, fontWeight: '800', fontSize: 16 },
  hero: { backgroundColor: colors.text, borderRadius: radius.lg, padding: 18, alignItems: 'center' },
  heroLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 15, fontWeight: '700' },
  heroValue: { color: colors.white, fontSize: 40, fontWeight: '900', marginVertical: 2 },
  heroSub: { color: 'rgba(255,255,255,0.8)', fontSize: 15 },
  statRow: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, borderRadius: radius.md, padding: 12 },
  statLabel: { fontSize: 14, fontWeight: '800' },
  statValue: { fontSize: 20, fontWeight: '900', marginTop: 2 },
  statCount: { fontSize: 13, fontWeight: '600', opacity: 0.85 },
  card: { backgroundColor: colors.card, borderRadius: radius.md, padding: 14, borderWidth: 1, borderColor: colors.border },
  cardTitle: { fontSize: 17, fontWeight: '800', color: colors.text, marginBottom: 4 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  itemName: { flex: 1, fontSize: 16, color: colors.text, fontWeight: '600' },
  itemQty: { fontSize: 16, color: colors.muted, fontWeight: '700' },
  itemAmount: { fontSize: 16, color: colors.text, fontWeight: '800', minWidth: 72, textAlign: 'right' },
  muted: { color: colors.muted, fontSize: 15 },
  profit: { backgroundColor: colors.text, flex: 2 },
  rangeRow: { flexDirection: 'row', gap: 8 },
  dateBtn: { flex: 1, backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 10, minHeight: 56 },
  dateLabel: { fontSize: 13, fontWeight: '700', color: colors.muted },
  dateValueRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  dateValue: { fontSize: 17, fontWeight: '800', color: colors.text },
  kitchenRow: { paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  kitchenText: { fontSize: 15, color: colors.muted, fontWeight: '600', marginTop: 2 },
  dayExpense: { fontSize: 13, color: '#B91C1C', fontWeight: '700', textAlign: 'right' },
});
