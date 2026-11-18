import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatRupees } from '../lib/format';
import { colors, radius } from '../theme';

type Props = {
  name: string;
  price: number;
  color: string;
  qty: number;
  width: number;
  onAdd: () => void;
  onRemove: () => void;
};

/** Big tap target: tap anywhere adds one; the round "−" button removes one. */
export function ItemTile({ name, price, color, qty, width, onAdd, onRemove }: Props) {
  const selected = qty > 0;
  return (
    <Pressable
      onPress={onAdd}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${formatRupees(price)}${selected ? `, ${qty} added` : ''}`}
      style={({ pressed }) => [
        styles.tile,
        { width, backgroundColor: color, transform: [{ scale: pressed ? 0.97 : 1 }] },
        selected && styles.selected,
      ]}
    >
      <Text style={styles.name} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.75}>
        {name}
      </Text>
      <Text style={styles.price}>{formatRupees(price)}</Text>

      {selected && (
        <>
          <View style={styles.badge}>
            <Text style={[styles.badgeText, { color }]} maxFontSizeMultiplier={1.3}>
              {qty}
            </Text>
          </View>
          <Pressable
            onPress={onRemove}
            hitSlop={8}
            accessibilityLabel={`Remove one ${name}`}
            style={({ pressed }) => [styles.minus, pressed && { backgroundColor: 'rgba(0,0,0,0.45)' }]}
          >
            <Ionicons name="remove" size={28} color={colors.white} />
          </Pressable>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    minHeight: 112,
    borderRadius: radius.lg,
    padding: 14,
    paddingRight: 52,
    justifyContent: 'space-between',
    borderWidth: 4,
    borderColor: 'transparent',
  },
  selected: { borderColor: colors.text },
  name: { color: colors.white, fontSize: 19, fontWeight: '800', lineHeight: 23 },
  price: { color: 'rgba(255,255,255,0.9)', fontSize: 17, fontWeight: '600', marginTop: 6 },
  badge: {
    position: 'absolute',
    top: 8,
    right: 8,
    minWidth: 40,
    height: 40,
    paddingHorizontal: 6,
    borderRadius: 20,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 20, fontWeight: '900' },
  minus: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
