import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { AppVersion } from '../../components/AppVersion';
import { FamilySyncSection } from '../../components/FamilySyncSection';
import { MenuItemModal } from '../../components/MenuItemModal';
import { ScreenHeader } from '../../components/ScreenHeader';
import { useToast } from '../../components/Toast';
import { exportBackup, pickBackup, restoreBackup } from '../../db/backup';
import { addMenuItem, deleteMenuItem, listMenu, moveMenuItem, updateMenuItem } from '../../db/menu';
import { DEFAULT_SETTINGS, getSettings, saveSetting } from '../../db/settings';
import { formatDayShort } from '../../lib/dates';
import { emitDataChanged } from '../../lib/events';
import { formatRupees } from '../../lib/format';
import type { MenuItem, Settings } from '../../lib/types';
import { useSync } from '../../sync/SyncProvider';
import { colors, radius } from '../../theme';

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const toast = useToast();
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [name, setName] = useState(DEFAULT_SETTINGS.restaurantName);
  const [editing, setEditing] = useState<MenuItem | 'new' | null>(null);
  const [busy, setBusy] = useState<'export' | 'restore' | null>(null);
  const { connected } = useSync();

  const load = useCallback(async () => {
    const [m, s] = await Promise.all([listMenu(db), getSettings(db)]);
    setMenu(m);
    setSettings(s);
    setName(s.restaurantName);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const toggleOrderType = async (value: boolean) => {
    setSettings((s) => ({ ...s, showOrderType: value }));
    await saveSetting(db, 'show_order_type', value ? '1' : '0');
    emitDataChanged();
  };

  const saveName = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === settings.restaurantName) {
      setName(settings.restaurantName);
      return;
    }
    await saveSetting(db, 'restaurant_name', trimmed);
    emitDataChanged();
    setSettings((s) => ({ ...s, restaurantName: trimmed }));
    toast({ tone: 'success', message: 'Restaurant name saved' });
  };

  const move = async (id: number, dir: -1 | 1) => {
    await moveMenuItem(db, id, dir);
    await load();
    emitDataChanged();
  };

  const doExport = async () => {
    setBusy('export');
    try {
      await exportBackup(db);
    } catch (e) {
      Alert.alert('Backup failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const doRestore = async () => {
    if (connected) {
      Alert.alert(
        'Sign out of family sync first',
        'Restoring a backup replaces this phone\'s data. To avoid mixing it into the family\'s shared data, ' +
          'tap "Sign out" under Family sync first.',
      );
      return;
    }
    setBusy('restore');
    try {
      const data = await pickBackup();
      if (!data) return;
      const orderCount = data.orders.filter((o) => !o.deleted).length;
      Alert.alert(
        'Replace all data?',
        `This replaces ALL orders, menu and settings on this phone with the backup from ${formatDayShort(
          new Date(data.exported_at),
        )} (${orderCount} orders). This cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Replace',
            style: 'destructive',
            onPress: async () => {
              try {
                await restoreBackup(db, data);
                await load();
                emitDataChanged();
                toast({ tone: 'success', message: `Backup restored · ${orderCount} orders` });
              } catch (e) {
                Alert.alert('Restore failed', e instanceof Error ? e.message : String(e));
              }
            },
          },
        ],
      );
    } catch (e) {
      Alert.alert('Restore failed', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Settings" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <FamilySyncSection />

        <Section title="Menu" hint="Tap an item to change its name, price or colour.">
          {menu.map((m, i) => (
            <View key={m.id} style={styles.menuRow}>
              <Pressable style={styles.menuMain} onPress={() => setEditing(m)} accessibilityHint="Edit item">
                <View style={[styles.dot, { backgroundColor: m.color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.menuName, !m.active && styles.hiddenText]} numberOfLines={2}>
                    {m.name}
                  </Text>
                  <Text style={styles.menuPrice}>
                    {formatRupees(m.price)}
                    {!m.active ? '  ·  Hidden' : ''}
                  </Text>
                </View>
              </Pressable>
              <IconBtn icon="arrow-up" disabled={i === 0} onPress={() => move(m.id, -1)} label={`Move ${m.name} up`} />
              <IconBtn
                icon="arrow-down"
                disabled={i === menu.length - 1}
                onPress={() => move(m.id, 1)}
                label={`Move ${m.name} down`}
              />
            </View>
          ))}
          <Pressable onPress={() => setEditing('new')} style={styles.addBtn}>
            <Ionicons name="add-circle" size={22} color={colors.primary} />
            <Text style={styles.addText}>Add item</Text>
          </Pressable>
        </Section>

        <Section title="Order screen">
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchLabel}>Dine-in / Parcel tag</Text>
              <Text style={styles.hint}>Shows a Dine-in / Parcel choice on each order.</Text>
            </View>
            <Switch value={settings.showOrderType} onValueChange={toggleOrderType} />
          </View>
        </Section>

        <Section title="Restaurant name" hint="Shown on the order screen and in shared summaries.">
          <TextInput
            value={name}
            onChangeText={setName}
            onEndEditing={saveName}
            onSubmitEditing={saveName}
            returnKeyType="done"
            style={styles.input}
          />
        </Section>

        <Section
          title="Backup"
          hint="Export a backup every week and send it to WhatsApp or Google Drive. With family sync on, the data is also kept in the shop's cloud."
        >
          <Pressable onPress={doExport} disabled={!!busy} style={[styles.bigBtn, { backgroundColor: colors.primary }]}>
            {busy === 'export' ? <ActivityIndicator color={colors.white} /> : <Ionicons name="share-outline" size={20} color={colors.white} />}
            <Text style={styles.bigBtnText}>Export backup</Text>
          </Pressable>
          <Pressable onPress={doRestore} disabled={!!busy} style={[styles.bigBtn, styles.outlineBtn]}>
            {busy === 'restore' ? <ActivityIndicator color={colors.text} /> : <Ionicons name="download-outline" size={20} color={colors.text} />}
            <Text style={[styles.bigBtnText, { color: colors.text }]}>Restore from backup</Text>
          </Pressable>
        </Section>

        <AppVersion />
      </ScrollView>

      <MenuItemModal
        item={editing}
        onClose={() => setEditing(null)}
        onSave={async (input) => {
          if (editing === 'new') await addMenuItem(db, input);
          else if (editing) await updateMenuItem(db, editing.id, input);
          await load();
          emitDataChanged();
          toast({ tone: 'success', message: `${input.name} saved` });
        }}
        onDelete={async (item) => {
          await deleteMenuItem(db, item.id);
          await load();
          emitDataChanged();
          toast({ message: `${item.name} deleted` });
        }}
      />
    </View>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {hint && <Text style={styles.hint}>{hint}</Text>}
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function IconBtn({
  icon,
  onPress,
  disabled,
  label,
}: {
  icon: 'arrow-up' | 'arrow-down';
  onPress: () => void;
  disabled: boolean;
  label: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.iconBtn, disabled && { opacity: 0.25 }]}
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={20} color={colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingTop: 4, gap: 20, paddingBottom: 48 },
  section: { gap: 6 },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: colors.text },
  sectionBody: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    gap: 8,
    marginTop: 4,
  },
  hint: { fontSize: 14, color: colors.muted, lineHeight: 19 },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  menuMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6, minHeight: 52 },
  dot: { width: 28, height: 28, borderRadius: 14 },
  menuName: { fontSize: 17, fontWeight: '700', color: colors.text },
  hiddenText: { color: colors.muted, textDecorationLine: 'line-through' },
  menuPrice: { fontSize: 15, color: colors.muted, marginTop: 2 },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, justifyContent: 'center' },
  addText: { fontSize: 17, fontWeight: '800', color: colors.primary },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchLabel: { fontSize: 17, fontWeight: '700', color: colors.text },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    height: 52,
    fontSize: 18,
    color: colors.text,
    backgroundColor: colors.bg,
  },
  bigBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 54,
    borderRadius: radius.sm,
  },
  outlineBtn: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  bigBtnText: { color: colors.white, fontSize: 17, fontWeight: '800' },
});
