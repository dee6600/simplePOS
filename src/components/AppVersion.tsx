import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatDayShort } from '../lib/dates';
import { formatTime } from '../lib/format';
import { colors, radius } from '../theme';

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
        {updatedAt ? ` · updated ${formatDayShort(updatedAt)} ${formatTime(updatedAt.getTime())}` : ''}
      </Text>
      {Updates.isEnabled && (
        <Pressable onPress={check} disabled={busy} style={styles.btn} accessibilityRole="button">
          {busy ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={styles.btnText}>Check for app update</Text>
          )}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 8 },
  version: { textAlign: 'center', color: colors.muted, fontSize: 13 },
  btn: {
    paddingHorizontal: 18,
    height: 44,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    justifyContent: 'center',
    minWidth: 200,
    alignItems: 'center',
  },
  btnText: { color: colors.primary, fontSize: 15, fontWeight: '800' },
});
