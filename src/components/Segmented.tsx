import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius } from '../theme';

type Option<T extends string> = { value: T; label: string };

type Props<T extends string> = {
  options: Option<T>[];
  value: T | null;
  onChange: (value: T) => void;
  /** Tapping the selected option again clears it (value becomes null via onClear). */
  onClear?: () => void;
};

export function Segmented<T extends string>({ options, value, onChange, onClear }: Props<T>) {
  return (
    <View style={styles.wrap}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => (active && onClear ? onClear() : onChange(o.value))}
            style={[styles.option, active && styles.active]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.text, active && styles.activeText]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    backgroundColor: '#EAE4DA',
    borderRadius: radius.md,
    padding: 4,
    gap: 4,
  },
  option: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  active: {
    backgroundColor: colors.card,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  text: { fontSize: 16, fontWeight: '700', color: colors.muted },
  activeText: { color: colors.text },
});
