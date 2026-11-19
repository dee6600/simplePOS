import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { KIND_META, MoneyEntryModal, type MoneyModalTarget } from '../../components/MoneyEntryModal';
import { PeriodNav } from '../../components/PeriodNav';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useToast } from '../../components/Toast';
import { addMoneyEntry, getBalanceSums, listMoneyEntries, setMoneyEntryDeleted, updateMoneyEntry } from '../../db/money';
import { computeBalance, type Balance } from '../../lib/balance';
import { periodLabel, periodRange, shiftPeriod } from '../../lib/dates';
import { emitDataChanged, useDataChanged } from '../../lib/events';
import { formatRupees, formatTime } from '../../lib/format';
import type { MoneyEntry, MoneyKind } from '../../lib/types';
import { useSync } from '../../sync/SyncProvider';
import { colors, radius } from '../../theme';

const ICONS: Record<MoneyKind, keyof typeof Ionicons.glyphMap> = {
  expense: 'cart-outline',
  in: 'arrow-down-circle-outline',
  out: 'arrow-up-circle-outline',
};

export default function MoneyScreen() {
  const db = useSQLiteContext();
  const toast = useToast();
  const { userName } = useSync();
  const [dayOffset, setDayOffset] = useState(0);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [entries, setEntries] = useState<MoneyEntry[]>([]);
  const [target, setTarget] = useState<MoneyModalTarget>(null);
  const requestId = useRef(0);

  const anchor = shiftPeriod('day', new Date(), dayOffset);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    const range = periodRange('day', shiftPeriod('day', new Date(), dayOffset));
    const [sums, list] = await Promise.all([getBalanceSums(db), listMoneyEntries(db, range)]);
    if (id !== requestId.current) return;
    setBalance(computeBalance(sums));
    setEntries(list);
  }, [db, dayOffset]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  useDataChanged(load);

  const dayTotals = entries.reduce(
    (t, e) => ({ ...t, [e.kind]: t[e.kind] + e.amount }),
    { expense: 0, in: 0, out: 0 } as Record<MoneyKind, number>,
  );

  const remove = async (entry: MoneyEntry) => {
    await setMoneyEntryDeleted(db, entry.id, true);
    emitDataChanged();
    toast({
      tone: 'danger',
      message: `${entryTitle(entry)} ${formatRupees(entry.amount)} deleted`,
      actionLabel: 'UNDO',
      onAction: async () => {
        await setMoneyEntryDeleted(db, entry.id, false);
        emitDataChanged();
      },
    });
  };

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Money" subtitle={userName ? `This phone: ${userName}` : undefined} />
      <ScrollView contentContainerStyle={styles.content}>
        {balance && (
          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>Balance now</Text>
            <View style={styles.balanceRow}>
              <View style={styles.balanceCol}>
                <Text style={styles.balanceSub}>Cash in hand</Text>
                <Text style={[styles.balanceValue, balance.cash < 0 && styles.negative]} adjustsFontSizeToFit numberOfLines={1}>
                  {formatRupees(balance.cash)}
                </Text>
              </View>
              <View style={styles.balanceCol}>
                <Text style={styles.balanceSub}>Bank (UPI)</Text>
                <Text style={[styles.balanceValue, balance.bank < 0 && styles.negative]} adjustsFontSizeToFit numberOfLines={1}>
                  {formatRupees(balance.bank)}
                </Text>
              </View>
            </View>
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total</Text>
              <Text style={styles.totalValue}>{formatRupees(balance.total)}</Text>
            </View>
            {balance.toCollectCount > 0 && (
              <Text style={styles.toCollect}>
                + {formatRupees(balance.toCollect)} still to collect ({balance.toCollectCount} pending order
                {balance.toCollectCount === 1 ? '' : 's'})
              </Text>
            )}
          </View>
        )}

        <View style={styles.actions}>
          {(['expense', 'in', 'out'] as const).map((k) => (
            <Pressable
              key={k}
              onPress={() => setTarget({ kind: k })}
              style={({ pressed }) => [styles.actionBtn, { backgroundColor: KIND_META[k].color }, pressed && { opacity: 0.85 }]}
              accessibilityRole="button"
            >
              <Ionicons name={ICONS[k]} size={26} color={colors.white} />
              <Text style={styles.actionText} numberOfLines={1} adjustsFontSizeToFit>
                {k === 'expense' ? 'Expense' : k === 'in' ? 'Add money' : 'Take out'}
              </Text>
            </Pressable>
          ))}
        </View>

        <PeriodNav
          label={periodLabel('day', anchor)}
          onPrev={() => setDayOffset((d) => d - 1)}
          onNext={() => setDayOffset((d) => Math.min(0, d + 1))}
          nextDisabled={dayOffset >= 0}
          onReset={dayOffset !== 0 ? () => setDayOffset(0) : undefined}
        />

        {entries.length > 0 && (
          <Text style={styles.dayTotals}>
            Expenses {formatRupees(dayTotals.expense)} · Added {formatRupees(dayTotals.in)} · Taken out{' '}
            {formatRupees(dayTotals.out)}
          </Text>
        )}

        {entries.map((e) => (
          <Pressable
            key={e.uid}
            onPress={() => setTarget({ kind: e.kind, entry: e })}
            style={({ pressed }) => [styles.entry, pressed && { opacity: 0.8 }]}
            accessibilityHint="Opens the entry to edit or delete"
          >
            <View style={[styles.entryIcon, { backgroundColor: KIND_META[e.kind].color }]}>
              <Ionicons name={ICONS[e.kind]} size={22} color={colors.white} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.entryTitle} numberOfLines={1}>
                {entryTitle(e)}
                <Text style={styles.method}>  {e.method === 'cash' ? 'Cash' : 'Bank'}</Text>
              </Text>
              {e.note ? (
                <Text style={styles.entryNote} numberOfLines={2}>
                  {e.note}
                </Text>
              ) : null}
              <Text style={styles.entryWho}>
                {formatTime(e.created_at)} · by {e.created_by || 'unknown'}
                {e.updated_by && e.updated_by !== e.created_by ? ` · edited by ${e.updated_by}` : ''}
              </Text>
            </View>
            <Text style={[styles.entryAmount, { color: KIND_META[e.kind].color }]}>
              {KIND_META[e.kind].sign}
              {formatRupees(e.amount)}
            </Text>
          </Pressable>
        ))}

        {entries.length === 0 && <Text style={styles.empty}>No expenses or money entries on this day.</Text>}
      </ScrollView>

      <MoneyEntryModal
        target={target}
        userName={userName ?? ''}
        onClose={() => setTarget(null)}
        onSave={async (input, entry) => {
          if (entry) await updateMoneyEntry(db, entry.id, input);
          else await addMoneyEntry(db, input);
          setDayOffset(entry ? dayOffset : 0);
          emitDataChanged();
          await load();
          toast({
            tone: 'success',
            message: `${entry ? 'Updated' : 'Saved'}: ${input.kind === 'expense' ? input.category : KIND_META[input.kind].title} ${formatRupees(input.amount)}`,
          });
        }}
        onDelete={remove}
      />
    </View>
  );
}

function entryTitle(e: MoneyEntry): string {
  if (e.kind === 'expense') return e.category || 'Expense';
  return e.kind === 'in' ? 'Money added' : 'Money taken out';
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingTop: 4, gap: 12, paddingBottom: 40 },
  balanceCard: { backgroundColor: colors.text, borderRadius: radius.lg, padding: 16, gap: 10 },
  balanceLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 15, fontWeight: '700' },
  balanceRow: { flexDirection: 'row', gap: 12 },
  balanceCol: { flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: radius.md, padding: 12 },
  balanceSub: { color: 'rgba(255,255,255,0.75)', fontSize: 14, fontWeight: '700' },
  balanceValue: { color: colors.white, fontSize: 26, fontWeight: '900', marginTop: 2 },
  negative: { color: '#FCA5A5' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  totalLabel: { color: 'rgba(255,255,255,0.8)', fontSize: 16, fontWeight: '700' },
  totalValue: { color: colors.white, fontSize: 30, fontWeight: '900' },
  toCollect: { color: '#FDE68A', fontSize: 14, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 8 },
  actionBtn: { flex: 1, height: 72, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: 4 },
  actionText: { color: colors.white, fontSize: 16, fontWeight: '800' },
  dayTotals: { fontSize: 14, color: colors.muted, fontWeight: '700', textAlign: 'center' },
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
  entryIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  entryTitle: { fontSize: 17, fontWeight: '800', color: colors.text },
  method: { fontSize: 13, fontWeight: '700', color: colors.muted },
  entryNote: { fontSize: 15, color: colors.text, marginTop: 2 },
  entryWho: { fontSize: 13, color: colors.muted, marginTop: 3 },
  entryAmount: { fontSize: 19, fontWeight: '900' },
  empty: { textAlign: 'center', color: colors.muted, fontSize: 16, marginTop: 24 },
});
