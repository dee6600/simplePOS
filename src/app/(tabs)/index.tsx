import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { OrderEditor } from '../../components/OrderEditor';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useToast } from '../../components/Toast';
import { listMenu } from '../../db/menu';
import { createOrder, listOrders, type OrderInput } from '../../db/orders';
import { DEFAULT_SETTINGS, getSettings } from '../../db/settings';
import { periodRange } from '../../lib/dates';
import { emitDataChanged, useDataChanged } from '../../lib/events';
import { formatRupees, linesTotal } from '../../lib/format';
import type { MenuItem, Settings } from '../../lib/types';
import { STATUS } from '../../theme';

export default function NewOrderScreen() {
  const db = useSQLiteContext();
  const toast = useToast();
  const router = useRouter();
  const [menu, setMenu] = useState<MenuItem[] | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [today, setToday] = useState({ count: 0, total: 0 });

  const loadToday = useCallback(async () => {
    const orders = await listOrders(db, periodRange('day', new Date()));
    setToday({ count: orders.length, total: orders.reduce((s, o) => s + o.total, 0) });
  }, [db]);

  // Orders from other phones update today's count right away (the menu waits for the next visit,
  // so an order being tapped in is never disturbed).
  useDataChanged(
    useCallback(() => {
      loadToday();
    }, [loadToday]),
  );

  // Reload whenever the tab is shown, so menu/settings edits show up immediately.
  useFocusEffect(
    useCallback(() => {
      (async () => {
        const [m, s] = await Promise.all([listMenu(db, { activeOnly: true }), getSettings(db)]);
        setMenu(m);
        setSettings(s);
        await loadToday();
      })();
    }, [db, loadToday]),
  );

  const onSubmit = async (input: OrderInput) => {
    const { id, orderNo } = await createOrder(db, input);
    toast({
      tone: 'success',
      message: `Order #${orderNo} saved · ${STATUS[input.status].label} · ${formatRupees(linesTotal(input.lines))}`,
      actionLabel: 'EDIT',
      onAction: () => router.push({ pathname: '/order/[id]', params: { id: String(id) } }),
    });
    emitDataChanged();
    loadToday();
  };

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader
        title="New Order"
        subtitle={`${settings.restaurantName} · Today: ${today.count} order${today.count === 1 ? '' : 's'} · ${formatRupees(today.total)}`}
      />
      {menu ? (
        <OrderEditor menu={menu} showOrderType={settings.showOrderType} onSubmit={onSubmit} />
      ) : (
        <ActivityIndicator style={{ marginTop: 40 }} />
      )}
    </View>
  );
}
