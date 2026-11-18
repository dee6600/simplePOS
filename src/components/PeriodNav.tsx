import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius } from '../theme';

type Props = {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  nextDisabled: boolean;
  /** Shown when not on the current period; jumps back to it. */
  onReset?: () => void;
  resetLabel?: string;
};

export function PeriodNav({ label, onPrev, onNext, nextDisabled, onReset, resetLabel = 'Today' }: Props) {
  return (
    <View style={styles.wrap}>
      <Pressable onPress={onPrev} style={styles.arrow} hitSlop={8} accessibilityLabel="Previous">
        <Ionicons name="chevron-back" size={26} color={colors.text} />
      </Pressable>
      <View style={styles.center}>
        <Text style={styles.label} numberOfLines={1} adjustsFontSizeToFit>
          {label}
        </Text>
        {onReset && (
          <Pressable onPress={onReset} hitSlop={8}>
            <Text style={styles.reset}>Go to {resetLabel.toLowerCase()}</Text>
          </Pressable>
        )}
      </View>
      <Pressable
        onPress={onNext}
        disabled={nextDisabled}
        style={[styles.arrow, nextDisabled && { opacity: 0.25 }]}
        hitSlop={8}
        accessibilityLabel="Next"
      >
        <Ionicons name="chevron-forward" size={26} color={colors.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 56,
  },
  arrow: { width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center' },
  label: { fontSize: 17, fontWeight: '800', color: colors.text },
  reset: { fontSize: 14, fontWeight: '700', color: colors.primary, marginTop: 2 },
});
