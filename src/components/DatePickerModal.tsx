import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { MONTH_NAMES, periodStart, sameDay } from '../lib/dates';
import { colors, radius } from '../theme';

const WEEK_HEAD = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

type Props = {
  /** Shown when set. */
  value: Date | null;
  title: string;
  /** Days after this can't be picked (usually today). */
  maxDate?: Date;
  onPick: (date: Date) => void;
  onClose: () => void;
};

/** A month calendar in a popup. Plain JavaScript, so it ships as an online update (no native date picker). */
export function DatePickerModal({ value, ...rest }: Props) {
  return (
    <Modal visible={!!value} transparent animationType="fade" onRequestClose={rest.onClose}>
      {value && <Calendar key={value.getTime()} value={value} {...rest} />}
    </Modal>
  );
}

function Calendar({ value, title, maxDate, onPick, onClose }: Props & { value: Date }) {
  const [month, setMonth] = useState(() => periodStart('month', value));
  const max = maxDate ? periodStart('day', maxDate).getTime() : Number.MAX_SAFE_INTEGER;
  const y = month.getFullYear();
  const m = month.getMonth();
  const lead = (month.getDay() + 6) % 7; // Monday first
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(y, m, i + 1)),
  ];
  while (cells.length % 7) cells.push(null);
  const nextDisabled = new Date(y, m + 1, 1).getTime() > max;
  const today = new Date();

  return (
    <View style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      <View style={styles.sheet}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.monthRow}>
          <Pressable onPress={() => setMonth(new Date(y, m - 1, 1))} style={styles.arrow} hitSlop={8} accessibilityLabel="Previous month">
            <Ionicons name="chevron-back" size={26} color={colors.text} />
          </Pressable>
          <Text style={styles.month}>
            {MONTH_NAMES[m]} {y}
          </Text>
          <Pressable
            onPress={() => setMonth(new Date(y, m + 1, 1))}
            disabled={nextDisabled}
            style={[styles.arrow, nextDisabled && { opacity: 0.25 }]}
            hitSlop={8}
            accessibilityLabel="Next month"
          >
            <Ionicons name="chevron-forward" size={26} color={colors.text} />
          </Pressable>
        </View>
        <View style={styles.grid}>
          {WEEK_HEAD.map((w) => (
            <Text key={w} style={[styles.cell, styles.head]}>
              {w}
            </Text>
          ))}
          {cells.map((d, i) => {
            if (!d) return <View key={`e${i}`} style={styles.cell} />;
            const disabled = d.getTime() > max;
            const selected = sameDay(d, value);
            return (
              <Pressable
                key={d.getTime()}
                disabled={disabled}
                onPress={() => onPick(d)}
                style={[styles.cell, styles.day, selected && styles.selected, disabled && { opacity: 0.25 }]}
                accessibilityState={{ selected, disabled }}
              >
                <Text style={[styles.dayText, sameDay(d, today) && styles.today, selected && { color: colors.white }]}>
                  {d.getDate()}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Pressable onPress={onClose} style={styles.cancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: 16, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 16, width: '100%', maxWidth: 420, alignSelf: 'center' },
  title: { fontSize: 20, fontWeight: '900', color: colors.text, marginBottom: 4 },
  monthRow: { flexDirection: 'row', alignItems: 'center' },
  arrow: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  month: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: colors.text },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, height: 46, alignItems: 'center', justifyContent: 'center' },
  head: { fontSize: 13, fontWeight: '800', color: colors.muted, textAlign: 'center', lineHeight: 46 },
  day: { borderRadius: 23 },
  selected: { backgroundColor: colors.primary },
  dayText: { fontSize: 17, fontWeight: '700', color: colors.text },
  today: { color: colors.primary, fontWeight: '900' },
  cancel: { alignItems: 'center', paddingVertical: 12, marginTop: 4 },
  cancelText: { fontSize: 16, fontWeight: '800', color: colors.muted },
});
