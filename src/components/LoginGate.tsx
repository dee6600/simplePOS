import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { ConnectMode } from '../sync/connectShop';
import { useSync } from '../sync/SyncProvider';
import { colors, radius } from '../theme';

/** The family's names, offered as one-tap choices. */
export const QUICK_NAMES = ['Mom', 'Dad', 'Shree', 'Dee'];

/**
 * One-time login: your phone number + who you are. Then the phone syncs with the family's shop,
 * and everything you add shows your name. Shown until a name is chosen.
 */
export function LoginGate() {
  const sync = useSync();
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  if (sync.userName) return null;

  const finish = async () => {
    await sync.setUserName(name);
  };

  const connectThenFinish = async (mode: ConnectMode) => {
    setBusy(true);
    try {
      const result = await sync.connect(phone, mode);
      if (result.status === 'choose') {
        setBusy(false);
        Alert.alert(
          'This phone already has data',
          `This phone has ${result.localCount} orders/money entries, and the family's shop already has data.\n\n` +
            '"Use shop data only" removes this phone\'s entries. If you are not sure, cancel, tap ' +
            '"Continue without sync for now" and export a backup in Settings first.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Also add this phone\'s data', onPress: () => connectThenFinish('keepLocal') },
            { text: 'Use shop data only', style: 'destructive', onPress: () => connectThenFinish('discardLocal') },
          ],
        );
        return;
      }
      await finish();
    } catch (e) {
      setBusy(false);
      Alert.alert('Could not sign in', e instanceof Error ? e.message : String(e), [
        { text: 'Try again', style: 'cancel' },
        { text: 'Use without sync for now', onPress: finish },
      ]);
    }
  };

  const onContinue = () => {
    if (!name.trim()) return Alert.alert('Choose who you are');
    if (sync.configured) {
      if (!phone.trim()) return Alert.alert('Enter your phone number');
      return connectThenFinish('ask');
    }
    return finish();
  };

  return (
    <Modal visible transparent animationType="fade">
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Text style={styles.title}>Welcome</Text>
            <Text style={styles.hint}>
              {sync.configured
                ? 'Sign in once on this phone. Orders, expenses and balances are shared with the family.'
                : 'Choose who uses this phone. Everything you add will show your name.'}
            </Text>

            {sync.configured && (
              <>
                <Text style={styles.label}>Your phone number</Text>
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="98765 43210"
                  keyboardType="phone-pad"
                  style={styles.input}
                  maxLength={16}
                />
              </>
            )}

            <Text style={styles.label}>Who are you?</Text>
            <View style={styles.chips}>
              {QUICK_NAMES.map((n) => (
                <Pressable key={n} onPress={() => setName(n)} style={[styles.chip, name === n && styles.chipActive]}>
                  <Text style={[styles.chipText, name === n && styles.chipTextActive]}>{n}</Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              value={QUICK_NAMES.includes(name) ? '' : name}
              onChangeText={setName}
              placeholder="Or type a name"
              style={styles.input}
              returnKeyType="done"
            />

            <Pressable
              onPress={onContinue}
              disabled={busy}
              style={[styles.btn, (!name.trim() || busy) && { backgroundColor: colors.disabled }]}
            >
              {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.btnText}>Continue</Text>}
            </Pressable>
            {sync.configured && (
              <Pressable
                onPress={() => (name.trim() ? finish() : Alert.alert('Choose who you are'))}
                disabled={busy}
                style={styles.skip}
                hitSlop={8}
              >
                <Text style={styles.skipText}>Continue without sync for now</Text>
              </Pressable>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 20 },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 22, gap: 10, maxWidth: 480, width: '100%', alignSelf: 'center' },
  title: { fontSize: 26, fontWeight: '900', color: colors.text },
  hint: { fontSize: 15, color: colors.muted, lineHeight: 21 },
  label: { fontSize: 14, fontWeight: '800', color: colors.muted, marginTop: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 20, height: 50, borderRadius: 25, justifyContent: 'center', backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 18, fontWeight: '800', color: colors.text },
  chipTextActive: { color: colors.white },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 14, height: 54, fontSize: 20, color: colors.text, backgroundColor: colors.bg },
  btn: { height: 56, borderRadius: radius.sm, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  btnText: { color: colors.white, fontSize: 18, fontWeight: '800' },
  skip: { alignItems: 'center', paddingVertical: 8 },
  skipText: { color: colors.muted, fontSize: 15, fontWeight: '700', textDecorationLine: 'underline' },
});
