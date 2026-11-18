import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { PeriodNav } from '../../components/PeriodNav';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Segmented } from '../../components/Segmented';
import { listMenu } from '../../db/menu';
import { listOrders } from '../../db/orders';
import { DEFAULT_SETTINGS, getSettings } from '../../db/settings';
import { formatDayShort, isLatestPeriod, periodLabel, periodRange, periodStart, shiftPeriod, type Period } from '../../lib/dates';
import { useDataChanged } from '../../lib/events';
import { formatRupees } from '../../lib/format';
import { summarize, summaryText, type Summary } from '../../lib/summary';
import type { Settings } from '../../lib/types';
import { colors, radius, STATUS } from '../../theme';

const RESET_LABEL: Record<Period, string> = { day: 'Today', week: 'This week', month: 'This month' };

export default function SummaryScreen() {
  const db = useSQLiteContext();
  const [period, setPeriod] = useState<Period>('day');
  const [offset, setOffset] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const requestId = useRef(0);

  const anchor = shiftPeriod(period, new Date(), offset);
  const label = periodLabel(period, anchor);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    const range = periodRange(period, shiftPeriod(period, new Date(), offset));
    const [orders, menu, s] = await Promise.all([listOrders(db, range), listMenu(db), getSettings(db)]);
    if (id !== requestId.current) return;
    setSummary(summarize(orders, menu.map((m) => m.id)));
    setSettings(s);
  }, [db, period, offset]);

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
        <Segmented<Period>
          options={[
            { value: 'day', label: 'Day' },
            { value: 'week', label: 'Week' },
            { value: 'month', label: 'Month' },
          ]}
          value={period}
          onChange={(p) => {
            setPeriod(p);
            setOffset(0);
          }}
        />
        <PeriodNav
          label={label}
          onPrev={() => setOffset((o) => o - 1)}
          onNext={() => setOffset((o) => o + 1)}
          nextDisabled={isLatestPeriod(period, anchor)}
          onReset={offset !== 0 ? () => setOffset(0) : undefined}
          resetLabel={RESET_LABEL[period]}
        />

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
              <Stat label="Pending" value={s.pending} count={s.pendingCount} color={STATUS.pending.color} bg={STATUS.pending.bg} />
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
                    <Text style={styles.itemAmount}>{formatRupees(d.total)}</Text>
                    <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                  </Pressable>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Stat({ label, value, count, color, bg }: { label: string; value: number; count: number; color: string; bg: string }) {
  return (
    <View style={[styles.stat, { backgroundColor: bg }]}>
      <Text style={[styles.statLabel, { color }]}>{label}</Text>
      <Text style={[styles.statValue, { color }]} numberOfLines={1} adjustsFontSizeToFit>
        {formatRupees(value)}
      </Text>
      <Text style={[styles.statCount, { color }]}>{count} order{count === 1 ? '' : 's'}</Text>
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
});
