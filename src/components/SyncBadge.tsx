import { StyleSheet, Text, View } from 'react-native';

import { useSync } from '../sync/SyncProvider';

/** Small "Synced ✓ / Uploading N… / Offline · N waiting" pill; hidden when family sync is off. */
export function SyncBadge() {
  const { connected, status } = useSync();
  if (!connected) return null;

  const { label, color } = (() => {
    switch (status.state) {
      case 'synced':
        return status.waiting > 0
          ? { label: `Uploading ${status.waiting}…`, color: '#1864AB' }
          : { label: 'Synced ✓', color: '#15803D' };
      case 'uploading':
        return { label: `Uploading ${status.waiting}…`, color: '#1864AB' };
      case 'offline':
        return {
          label: status.waiting > 0 ? `Offline · ${status.waiting} waiting` : 'Offline',
          color: '#B45309',
        };
      default:
        return { label: 'Connecting…', color: '#6B645C' };
    }
  })();

  return (
    <View style={[styles.pill, { borderColor: color }]} accessibilityLabel={`Sync: ${label}`}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.text, { color }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    borderWidth: 1,
    marginTop: 4,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { fontSize: 12, fontWeight: '800' },
});
