import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { formatTime } from '../lib/format';
import type { ConnectMode } from '../sync/connectShop';
import { formatPhone } from '../sync/shopLogin';
import { useSync } from '../sync/SyncProvider';
import { colors, radius } from '../theme';
import { QUICK_NAMES } from './LoginGate';
import { SyncBadge } from './SyncBadge';
import { useToast } from './Toast';

/** Settings: who uses this phone, and family sync (sign in with your phone number). */
export function FamilySyncSection() {
  const toast = useToast();
  const sync = useSync();
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(sync.userName ?? '');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);

  const saveName = async () => {
    if (!name.trim()) return;
    await sync.setUserName(name);
    setEditingName(false);
    toast({ tone: 'success', message: `This phone is now "${name.trim()}"` });
  };

  const connect = async (mode: ConnectMode) => {
    setBusy(true);
    try {
      const result = await sync.connect(phone, mode);
      if (result.status === 'choose') {
        setBusy(false);
        Alert.alert(
          'This phone already has data',
          `This phone has ${result.localCount} orders/money entries, and the family's shop already has data. ` +
            '"Add this phone\'s orders" uploads only the ones the shop doesn\'t have yet. "Use shop data only" ' +
            'removes this phone\'s entries. Export a backup first if you are not sure.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Add this phone\'s orders', onPress: () => connect('keepLocal') },
            { text: 'Use shop data only', style: 'destructive', onPress: () => connect('discardLocal') },
          ],
        );
        return;
      }
      toast({ tone: 'success', message: result.created ? 'Shop created. Uploading this phone\'s data…' : 'Signed in. Syncing…' });
    } catch (e) {
      Alert.alert('Could not sign in', e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  };

  const confirmSignOut = () =>
    Alert.alert('Sign out of family sync?', 'The data stays on this phone, but it stops sharing changes.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => sync.signOut() },
    ]);

  return (
    <>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>This phone</Text>
        <Text style={styles.hint}>Shown on every order, expense and money entry made on this phone.</Text>
        <View style={styles.body}>
          {editingName ? (
            <>
              <View style={styles.row}>
                {QUICK_NAMES.map((n) => (
                  <Pressable key={n} onPress={() => setName(n)} style={[styles.chip, name === n && styles.chipActive]}>
                    <Text style={[styles.chipText, name === n && { color: colors.white }]}>{n}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.row}>
                <TextInput value={name} onChangeText={setName} style={[styles.input, { flex: 1 }]} onSubmitEditing={saveName} />
                <Pressable onPress={saveName} style={[styles.smallBtn, { backgroundColor: colors.primary }]}>
                  <Text style={styles.smallBtnText}>Save</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.value}>{sync.userName}</Text>
                {sync.myPhone && <Text style={styles.hint}>{formatPhone(sync.myPhone)}</Text>}
              </View>
              <Pressable onPress={() => setEditingName(true)} style={[styles.smallBtn, styles.outline]}>
                <Text style={[styles.smallBtnText, { color: colors.text }]}>Change</Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Family sync</Text>
        <Text style={styles.hint}>Orders, expenses and balances are shared live between the family&apos;s phones.</Text>
        <View style={styles.body}>
          {!sync.configured ? (
            <Text style={styles.hint}>
              Family sync is not set up in this version of the app yet (Firebase settings missing — see FIREBASE_SETUP.md).
            </Text>
          ) : sync.connected ? (
            <>
              <View style={styles.row}>
                <Text style={styles.label}>Status</Text>
                <SyncBadge />
              </View>
              {sync.status.lastSyncedAt && (
                <Text style={styles.hint}>Last synced at {formatTime(sync.status.lastSyncedAt)}</Text>
              )}
              {sync.status.state === 'offline' && sync.status.error && (
                <Text style={[styles.hint, { color: colors.danger }]} numberOfLines={3}>
                  {sync.status.error}
                </Text>
              )}
              <View style={styles.row}>
                <Pressable onPress={sync.syncNow} style={[styles.bigBtn, { backgroundColor: colors.primary }]}>
                  <Text style={styles.bigBtnText}>Sync now</Text>
                </Pressable>
                <Pressable onPress={confirmSignOut} style={[styles.bigBtn, styles.outline]}>
                  <Text style={[styles.bigBtnText, { color: colors.text }]}>Sign out</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.hint}>Not signed in. Enter your phone number to share data with the family.</Text>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                placeholder="Your phone number"
                keyboardType="phone-pad"
                style={styles.input}
                maxLength={16}
              />
              <Pressable onPress={() => connect('ask')} disabled={busy} style={[styles.bigBtn, { backgroundColor: colors.primary }]}>
                {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.bigBtnText}>Sign in and sync</Text>}
              </Pressable>
            </>
          )}
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  section: { gap: 6 },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: colors.text },
  hint: { fontSize: 14, color: colors.muted, lineHeight: 19 },
  body: { backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: 12, gap: 10, marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  label: { fontSize: 15, color: colors.muted, fontWeight: '700', width: 60 },
  value: { fontSize: 18, fontWeight: '800', color: colors.text },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 14, height: 52, fontSize: 18, color: colors.text, backgroundColor: colors.bg },
  chip: { flex: 1, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 15, fontWeight: '700', color: colors.text },
  smallBtn: { paddingHorizontal: 16, height: 44, borderRadius: radius.sm, justifyContent: 'center' },
  smallBtnText: { color: colors.white, fontSize: 16, fontWeight: '800' },
  outline: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  bigBtn: { flex: 1, height: 52, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  bigBtnText: { color: colors.white, fontSize: 16, fontWeight: '800' },
});
