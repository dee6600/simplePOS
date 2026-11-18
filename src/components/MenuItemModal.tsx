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

import type { MenuItemInput } from '../db/menu';
import type { MenuItem } from '../lib/types';
import { colors, ITEM_COLORS, radius } from '../theme';

type Props = {
  /** The item being edited, 'new' to add one, or null when closed. */
  item: MenuItem | 'new' | null;
  onClose: () => void;
  onSave: (input: MenuItemInput) => Promise<void>;
  onDelete: (item: MenuItem) => Promise<void>;
};

export function MenuItemModal({ item, onClose, onSave, onDelete }: Props) {
  const existing = item && item !== 'new' ? item : null;
  return (
    <Modal visible={!!item} transparent animationType="fade" onRequestClose={onClose}>
      {item && (
        // Keyed so the form starts fresh for each item.
        <MenuItemForm key={existing ? existing.id : 'new'} existing={existing} onClose={onClose} onSave={onSave} onDelete={onDelete} />
      )}
    </Modal>
  );
}

function MenuItemForm({
  existing,
  onClose,
  onSave,
  onDelete,
}: Omit<Props, 'item'> & { existing: MenuItem | null }) {
  const [name, setName] = useState(existing?.name ?? '');
  const [price, setPrice] = useState(existing ? String(existing.price) : '');
  const [color, setColor] = useState(existing?.color ?? ITEM_COLORS[0]);
  const [active, setActive] = useState(existing ? existing.active === 1 : true);

  const save = async () => {
    const trimmed = name.trim();
    const p = Number(price.trim());
    if (!trimmed) return Alert.alert('Enter a name for the item');
    if (!price.trim() || !Number.isInteger(p) || p < 0) return Alert.alert('Enter the price in whole rupees (e.g. 120)');
    await onSave({ name: trimmed, price: p, color, active });
    onClose();
  };

  const confirmDelete = () => {
    if (!existing) return;
    Alert.alert(
      `Delete "${existing.name}"?`,
      'Past orders and summaries keep this item. To stop showing it without deleting, turn off "Show on order screen" instead.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await onDelete(existing);
            onClose();
          },
        },
      ],
    );
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      <View style={styles.sheet}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          <Text style={styles.title}>{existing ? 'Edit item' : 'Add item'}</Text>

          <Text style={styles.label}>Name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Chicken Biryani Full"
            style={styles.input}
            autoFocus={!existing}
            returnKeyType="next"
          />

          <Text style={styles.label}>Price (₹)</Text>
          <TextInput
            value={price}
            onChangeText={(t) => setPrice(t.replace(/[^0-9]/g, ''))}
            placeholder="e.g. 200"
            keyboardType="number-pad"
            style={styles.input}
          />

          <Text style={styles.label}>Colour</Text>
          <View style={styles.swatches}>
            {ITEM_COLORS.map((c) => (
              <Pressable
                key={c}
                onPress={() => setColor(c)}
                style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchActive]}
                accessibilityLabel={`Colour ${c}`}
                accessibilityState={{ selected: color === c }}
              />
            ))}
          </View>

          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>Show on order screen</Text>
            <Switch value={active} onValueChange={setActive} />
          </View>

          <View style={styles.buttons}>
            <Pressable onPress={onClose} style={[styles.btn, styles.btnGhost]}>
              <Text style={[styles.btnText, { color: colors.text }]}>Cancel</Text>
            </Pressable>
            <Pressable onPress={save} style={[styles.btn, { backgroundColor: colors.primary }]}>
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

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: 16, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { backgroundColor: colors.card, borderRadius: radius.lg, maxHeight: '90%', width: '100%', maxWidth: 520, alignSelf: 'center' },
  content: { padding: 20, gap: 8 },
  title: { fontSize: 22, fontWeight: '900', color: colors.text, marginBottom: 4 },
  label: { fontSize: 14, fontWeight: '700', color: colors.muted, marginTop: 6 },
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
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatch: { width: 44, height: 44, borderRadius: 22, borderWidth: 3, borderColor: 'transparent' },
  swatchActive: { borderColor: colors.text, transform: [{ scale: 1.1 }] },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  switchLabel: { fontSize: 17, fontWeight: '600', color: colors.text },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btn: { flex: 1, height: 52, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  btnGhost: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  btnText: { color: colors.white, fontSize: 17, fontWeight: '800' },
  deleteBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  deleteText: { color: colors.danger, fontSize: 16, fontWeight: '800' },
});
