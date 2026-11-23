import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScreenHeader } from '../components/ScreenHeader';
import { StockItemModal } from '../components/StockItemModal';
import { useToast } from '../components/Toast';
import { addStockItem, deleteStockItem, listStockItems, updateStockItem } from '../db/stock';
import { emitDataChanged } from '../lib/events';
import { GROUP_LABEL } from '../lib/stock';
import type { StockGroup, StockItem } from '../lib/types';
import { colors, radius } from '../theme';

const GROUPS: StockGroup[] = ['cooked', 'home', 'daily'];

/** Add, rename or hide the things tracked on the Stock tab. Shared with the family's phones. */
export default function StockItemsScreen() {
  const db = useSQLiteContext();
  const toast = useToast();
  const [items, setItems] = useState<StockItem[]>([]);
  const [editing, setEditing] = useState<StockItem | 'new' | null>(null);

  const load = useCallback(async () => setItems(await listStockItems(db)), [db]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title="Stock items" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content}>
        {GROUPS.map((g) => (
          <View key={g} style={styles.section}>
            <Text style={styles.sectionTitle}>{GROUP_LABEL[g]}</Text>
            <View style={styles.body}>
              {items
                .filter((i) => i.grp === g)
                .map((i) => (
                  <Pressable key={i.uid} onPress={() => setEditing(i)} style={styles.row} accessibilityHint="Edit item">
                    <Text style={[styles.name, !i.active && styles.hidden]}>{i.name}</Text>
                    <Text style={styles.meta}>
                      {i.unit}
                      {!i.active ? ' · Hidden' : ''}
                    </Text>
                    <Ionicons name="chevron-forward" size={18} color={colors.muted} />
                  </Pressable>
                ))}
            </View>
          </View>
        ))}
        <Pressable onPress={() => setEditing('new')} style={styles.addBtn}>
          <Ionicons name="add-circle" size={22} color={colors.primary} />
          <Text style={styles.addText}>Add item</Text>
        </Pressable>
      </ScrollView>

      <StockItemModal
        item={editing}
        onClose={() => setEditing(null)}
        onSave={async (input) => {
          if (editing === 'new') await addStockItem(db, input);
          else if (editing) await updateStockItem(db, editing.id, input);
          await load();
          emitDataChanged();
          toast({ tone: 'success', message: `${input.name.trim()} saved` });
        }}
        onDelete={async (item) => {
          await deleteStockItem(db, item.id);
          await load();
          emitDataChanged();
          toast({ message: `${item.name} deleted` });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingTop: 4, gap: 16, paddingBottom: 48 },
  section: { gap: 6 },
  sectionTitle: { fontSize: 18, fontWeight: '900', color: colors.text },
  body: { backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  name: { flex: 1, fontSize: 17, fontWeight: '700', color: colors.text },
  hidden: { color: colors.muted, textDecorationLine: 'line-through' },
  meta: { fontSize: 15, color: colors.muted },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, justifyContent: 'center' },
  addText: { fontSize: 17, fontWeight: '800', color: colors.primary },
});
