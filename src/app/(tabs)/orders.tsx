import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { OrderCard } from '../../components/OrderCard';
import { PeriodNav } from '../../components/PeriodNav';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Segmented } from '../../components/Segmented';
import { useToast } from '../../components/Toast';
import { listOrders, setOrderStatus } from '../../db/orders';
import { periodLabel, periodRange, shiftPeriod } from '../../lib/dates';
import { emitDataChanged, useDataChanged } from '../../lib/events';
import { formatRupees } from '../../lib/format';
import type { Order } from '../../lib/types';
import { colors, STATUS } from '../../theme';

type Filter = 'all' | 'pending' | 'paid';

export default function OrdersScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const toast = useToast();
  const [dayOffset, setDayOffset] = useState(0); // 0 = today, -1 = yesterday…
  const [filter, setFilter] = useState<Filter>('all');
  const [orders, setOrders] = useState<Order[] | null>(null);
  const requestId = useRef(0);

  const anchor = shiftPeriod('day', new Date(), dayOffset);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    const rows = await listOrders(db, periodRange('day', shiftPeriod('day', new Date(), dayOffset)));
    if (id === requestId.current) setOrders(rows); // ignore stale responses when flipping days quickly
  }, [db, dayOffset]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  useDataChanged(load);

  const stats = useMemo(() => {
    const list = orders ?? [];
    const pending = list.filter((o) => o.status === 'pending');
    return {
      count: list.length,
      total: list.reduce((s, o) => s + o.total, 0),
      pendingCount: pending.length,
      pendingTotal: pending.reduce((s, o) => s + o.total, 0),
    };
  }, [orders]);

  const visible = (orders ?? []).filter((o) =>
    filter === 'all' ? true : filter === 'pending' ? o.status === 'pending' : o.status !== 'pending',
  );

  const markPaid = async (order: Order, status: 'cash' | 'upi') => {
    await setOrderStatus(db, order.id, status);
    toast({ tone: 'success', message: `Order #${order.order_no} marked paid · ${STATUS[status].label}` });
    emitDataChanged();
  };

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader
        title="Orders"
        subtitle={`${stats.count} orders · ${formatRupees(stats.total)}${
          stats.pendingCount ? ` · Pending ${formatRupees(stats.pendingTotal)} (${stats.pendingCount})` : ''
        }`}
      />
      <View style={styles.controls}>
        <PeriodNav
          label={periodLabel('day', anchor)}
          onPrev={() => setDayOffset((d) => d - 1)}
          onNext={() => setDayOffset((d) => Math.min(0, d + 1))}
          nextDisabled={dayOffset >= 0}
          onReset={dayOffset !== 0 ? () => setDayOffset(0) : undefined}
        />
        <Segmented<Filter>
          options={[
            { value: 'all', label: `All (${stats.count})` },
            { value: 'pending', label: `Pending (${stats.pendingCount})` },
            { value: 'paid', label: `Paid (${stats.count - stats.pendingCount})` },
          ]}
          value={filter}
          onChange={setFilter}
        />
      </View>
      <FlatList
        data={visible}
        keyExtractor={(o) => String(o.id)}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={({ item }) => (
          <OrderCard
            order={item}
            onPress={() => router.push({ pathname: '/order/[id]', params: { id: String(item.id) } })}
            onMarkPaid={(s) => markPaid(item, s)}
          />
        )}
        ListEmptyComponent={
          orders ? (
            <Text style={styles.empty}>
              {filter === 'pending' ? 'No pending orders 🎉' : filter === 'paid' ? 'No paid orders yet.' : 'No orders on this day.'}
            </Text>
          ) : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  controls: { paddingHorizontal: 16, gap: 10, paddingBottom: 10 },
  list: { padding: 16, paddingTop: 4, paddingBottom: 32 },
  empty: { textAlign: 'center', color: colors.muted, fontSize: 17, marginTop: 40 },
});
