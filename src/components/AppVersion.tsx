import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatDayMonth } from '../lib/dates';
import { colors } from '../theme';

/**
 * App version, plus a button that downloads an online update (EAS Update) and restarts into it.
 * Updates also download by themselves when the app opens; they apply the next time it is opened.
 */
export function AppVersion() {
  const [busy, setBusy] = useState(false);
  const version = Constants.expoConfig?.version ?? '';
  const updatedAt = !Updates.isEmbeddedLaunch && Updates.createdAt ? Updates.createdAt : null;

  const check = async () => {
    setBusy(true);
    try {
      const result = await Updates.checkForUpdateAsync();
      if (!result.isAvailable) {
        setBusy(false);
        Alert.alert('Up to date', 'This phone already has the latest version of the app.');
        return;
      }
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync(); // restarts the app into the new version; data stays on the phone
    } catch (e) {
      setBusy(false);
      Alert.alert('Could not check for updates', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.version}>
        SimplePOS v{version}
        {updatedAt ? ` · ${formatDayMonth(updatedAt)}` : ''}
      </Text>
      {Updates.isEnabled &&
        (busy ? (
          <ActivityIndicator color={colors.primary} size="small" />
        ) : (
          <Pressable onPress={check} hitSlop={10} accessibilityRole="button">
            <Text style={styles.link}>· Check for update</Text>
          </Pressable>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 32 },
  version: { color: colors.muted, fontSize: 13 },
  link: { color: colors.primary, fontSize: 13, fontWeight: '800' },
});
