import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { OrderEditor } from '../../components/OrderEditor';
import { ByLine } from '../../components/ByLine';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useToast } from '../../components/Toast';
import { listMenu } from '../../db/menu';
import { getOrder, setOrderDeleted, updateOrder, type OrderInput } from '../../db/orders';
import { getSettings } from '../../db/settings';
import { formatDayShort } from '../../lib/dates';
import { emitDataChanged } from '../../lib/events';
import { formatTime } from '../../lib/format';
import type { MenuItem, Order, Settings } from '../../lib/types';
import { colors, radius } from '../../theme';

export default function EditOrderScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = Number(id);
  const db = useSQLiteContext();
  const router = useRouter();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<{ order: Order | null; menu: MenuItem[]; settings: Settings } | null>(null);

  useEffect(() => {
    (async () => {
      const [order, menu, settings] = await Promise.all([
        getOrder(db, orderId),
        listMenu(db, { activeOnly: true }),
        getSettings(db),
      ]);
      setData({ order, menu, settings });
    })();
  }, [db, orderId]);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/orders'));

  if (!data) return <ActivityIndicator style={{ marginTop: 80 }} />;

  const { order } = data;
  if (!order || order.deleted) {
    return (
      <View style={{ flex: 1 }}>
        <ScreenHeader title="Order not found" onBack={goBack} />
        <Text style={styles.missing}>This order was deleted.</Text>
      </View>
    );
  }

  const onSubmit = async (input: OrderInput) => {
    await updateOrder(db, order.id, input);
    toast({ tone: 'success', message: `Order #${order.order_no} updated` });
    emitDataChanged();
    goBack();
  };

  const onDelete = async () => {
    await setOrderDeleted(db, order.id, true);
    emitDataChanged();
    toast({
      tone: 'danger',
      message: `Order #${order.order_no} deleted`,
      actionLabel: 'UNDO',
      onAction: async () => {
        await setOrderDeleted(db, order.id, false);
        emitDataChanged();
        toast({ tone: 'success', message: `Order #${order.order_no} restored` });
      },
    });
    goBack();
  };

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader
        title={`Edit Order #${order.order_no}`}
        subtitle={`${formatDayShort(new Date(order.created_at))} · ${formatTime(order.created_at)}`}
        onBack={goBack}
        right={
          <Pressable onPress={onDelete} style={styles.delete} hitSlop={6} accessibilityLabel="Delete order">
            <Ionicons name="trash-outline" size={20} color={colors.danger} />
            <Text style={styles.deleteText}>Delete</Text>
          </Pressable>
        }
      />
      {order.created_by && order.created_by !== 'Imported' ? (
        <Text style={styles.who} numberOfLines={1}>
          Added <ByLine createdBy={order.created_by} updatedBy={order.updated_by} />
        </Text>
      ) : null}
      <OrderEditor
        menu={data.menu}
        showOrderType={data.settings.showOrderType}
        initial={order}
        bottomInset={insets.bottom}
        onSubmit={onSubmit}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  missing: { textAlign: 'center', color: colors.muted, fontSize: 17, marginTop: 40 },
  who: { fontSize: 15, color: colors.muted, paddingHorizontal: 16, paddingBottom: 6 },
  delete: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    height: 44,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.danger,
  },
  deleteText: { color: colors.danger, fontWeight: '800', fontSize: 16 },
});
