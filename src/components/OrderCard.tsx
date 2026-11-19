import { Pressable, StyleSheet, Text, View } from 'react-native';

import { describeLines, formatRupees, formatTime } from '../lib/format';
import type { Order } from '../lib/types';
import { colors, radius, STATUS } from '../theme';
import { StatusChip } from './StatusChip';

type Props = {
  order: Order;
  onPress: () => void;
  onMarkPaid: (status: 'cash' | 'upi') => void;
};

export function OrderCard({ order, onPress, onMarkPaid }: Props) {
  const pending = order.status === 'pending';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityHint="Opens the order to edit or delete"
      style={({ pressed }) => [styles.card, pending && styles.pendingCard, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.row}>
        <Text style={styles.no}>#{order.order_no}</Text>
        <Text style={styles.time}>{formatTime(order.created_at)}</Text>
        {order.created_by && order.created_by !== 'Imported' ? (
          <Text style={styles.by} numberOfLines={1}>
            by {order.created_by}
          </Text>
        ) : null}
        {order.order_type && (
          <View style={styles.tag}>
            <Text style={styles.tagText}>{order.order_type === 'parcel' ? 'Parcel' : 'Dine-in'}</Text>
          </View>
        )}
        <View style={styles.spacer} />
        <StatusChip status={order.status} />
      </View>

      <Text style={styles.items} numberOfLines={3}>
        {describeLines(order.items)}
      </Text>

      <View style={styles.row}>
        {pending && (
          <>
            {(['cash', 'upi'] as const).map((s) => (
              <Pressable
                key={s}
                onPress={() => onMarkPaid(s)}
                hitSlop={4}
                style={({ pressed }) => [styles.payBtn, { backgroundColor: STATUS[s].color }, pressed && { opacity: 0.8 }]}
                accessibilityLabel={`Mark order ${order.order_no} paid by ${STATUS[s].label}`}
              >
                <Text style={styles.payText}>{STATUS[s].button}</Text>
              </Pressable>
            ))}
          </>
        )}
        <View style={styles.spacer} />
        <Text style={styles.total}>{formatRupees(order.total)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  pendingCard: { borderColor: STATUS.pending.color, borderWidth: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  spacer: { flex: 1 },
  no: { fontSize: 20, fontWeight: '900', color: colors.text },
  time: { fontSize: 15, color: colors.muted },
  by: { fontSize: 13, color: colors.muted, flexShrink: 1 },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, backgroundColor: colors.bg },
  tagText: { fontSize: 13, fontWeight: '700', color: colors.muted },
  items: { fontSize: 16, color: colors.text, lineHeight: 22 },
  payBtn: { paddingHorizontal: 14, height: 44, borderRadius: radius.sm, justifyContent: 'center' },
  payText: { color: colors.white, fontSize: 15, fontWeight: '800' },
  total: { fontSize: 22, fontWeight: '900', color: colors.text },
});
