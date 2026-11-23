import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { StockItemInput } from '../db/stock';
import { EXPENSE_CATEGORIES } from '../lib/balance';
import { GROUP_LABEL, parseQty, STOCK_UNITS } from '../lib/stock';
import type { StockGroup, StockItem } from '../lib/types';
import { colors, radius } from '../theme';

type Props = {
  item: StockItem | 'new' | null;
  onClose: () => void;
  onSave: (input: StockItemInput) => Promise<void>;
  onDelete: (item: StockItem) => Promise<void>;
};

export function StockItemModal({ item, ...rest }: Props) {
  return (
    <Modal visible={!!item} transparent animationType="fade" onRequestClose={rest.onClose}>
      {item && <ItemForm key={item === 'new' ? 'new' : item.uid} item={item} {...rest} />}
    </Modal>
  );
}

function ItemForm({ item, onClose, onSave, onDelete }: Props & { item: StockItem | 'new' }) {
  const existing = item === 'new' ? null : item;
  const [name, setName] = useState(existing?.name ?? '');
  const [unit, setUnit] = useState(existing?.unit ?? 'kg');
  const [grp, setGrp] = useState<StockGroup>(existing?.grp ?? 'daily');
  const [low, setLow] = useState(existing?.low_level != null ? String(existing.low_level) : '');
  const [category, setCategory] = useState<string | null>(existing?.expense_category ?? 'Vegetables & Masala');
  const [active, setActive] = useState(existing ? existing.active === 1 : true);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!name.trim()) return Alert.alert('Enter a name');
    if (saving) return;
    setSaving(true);
    try {
      await onSave({
        name,
        unit,
        grp,
        active,
        low_level: grp === 'home' && low ? parseQty(low) : null,
        expense_category: grp === 'cooked' ? null : category,
      });
      onClose();
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  const confirmDelete = () => {
    if (!existing) return;
    Alert.alert(`Delete ${existing.name}?`, 'Past entries stay in the summaries.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await onDelete(existing);
          onClose();
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      <View style={styles.sheet}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          <Text style={styles.title}>{existing ? 'Edit stock item' : 'Add stock item'}</Text>

          <Text style={styles.label}>Name</Text>
          <TextInput value={name} onChangeText={setName} placeholder="e.g. Tomato" style={styles.input} autoFocus={!existing} />

          <Text style={styles.label}>Type</Text>
          <View style={styles.chips}>
            {(Object.keys(GROUP_LABEL) as StockGroup[]).map((g) => (
              <Chip key={g} label={GROUP_LABEL[g]} selected={grp === g} onPress={() => setGrp(g)} />
            ))}
          </View>

          <Text style={styles.label}>Unit</Text>
          <View style={styles.chips}>
            {STOCK_UNITS.map((u) => (
              <Chip key={u} label={u} selected={unit === u} onPress={() => setUnit(u)} />
            ))}
          </View>

          {grp === 'home' && (
            <>
              <Text style={styles.label}>Warn when stock is at or below ({unit})</Text>
              <TextInput
                value={low}
                onChangeText={(t) => setLow(t.replace(/[^0-9.,]/g, ''))}
                placeholder="e.g. 10"
                keyboardType="decimal-pad"
                style={styles.input}
              />
            </>
          )}

          {grp !== 'cooked' && (
            <>
              <Text style={styles.label}>Expense category (when you enter what was paid)</Text>
              <View style={styles.chips}>
                {EXPENSE_CATEGORIES.map((c) => (
                  <Chip key={c} label={c} selected={category === c} onPress={() => setCategory(c)} />
                ))}
              </View>
            </>
          )}

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Show on the Stock tab</Text>
            <Switch value={active} onValueChange={setActive} />
          </View>

          <View style={styles.buttons}>
            <Pressable onPress={onClose} style={[styles.btn, styles.btnGhost]}>
              <Text style={[styles.btnText, { color: colors.text }]}>Cancel</Text>
            </Pressable>
            <Pressable onPress={save} disabled={saving} style={[styles.btn, { backgroundColor: colors.primary }]}>
              <Text style={styles.btnText}>Save</Text>
            </Pressable>
          </View>
          {existing && (
            <Pressable onPress={confirmDelete} style={styles.deleteBtn}>
              <Text style={styles.deleteText}>Delete item</Text>
            </Pressable>
          )}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, selected && { backgroundColor: colors.primary, borderColor: colors.primary }]}
      accessibilityState={{ selected }}
    >
      <Text style={[styles.chipText, selected && { color: colors.white }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: 16, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { backgroundColor: colors.card, borderRadius: radius.lg, maxHeight: '92%', width: '100%', maxWidth: 520, alignSelf: 'center' },
  content: { padding: 20, gap: 8 },
  title: { fontSize: 22, fontWeight: '900', color: colors.text },
  label: { fontSize: 14, fontWeight: '700', color: colors.muted, marginTop: 6 },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 14, height: 52, fontSize: 17, color: colors.text, backgroundColor: colors.bg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, height: 44, borderRadius: 22, justifyContent: 'center', backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  chipText: { fontSize: 15, fontWeight: '700', color: colors.text },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  switchLabel: { fontSize: 16, fontWeight: '700', color: colors.text },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btn: { flex: 1, height: 54, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  btnGhost: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  btnText: { color: colors.white, fontSize: 17, fontWeight: '800' },
  deleteBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  deleteText: { color: colors.danger, fontSize: 16, fontWeight: '800' },
});
