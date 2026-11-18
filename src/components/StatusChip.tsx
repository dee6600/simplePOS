import { StyleSheet, Text, View } from 'react-native';

import type { Status } from '../lib/types';
import { STATUS } from '../theme';

export function StatusChip({ status }: { status: Status }) {
  const s = STATUS[status];
  return (
    <View style={[styles.chip, { backgroundColor: s.bg }]}>
      <Text style={[styles.text, { color: s.color }]}>{s.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  text: { fontSize: 14, fontWeight: '800' },
});
