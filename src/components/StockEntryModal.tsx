import { useState } from 'react';
import {
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

import type { StockEntryInput } from '../db/stock';
import { formatTime } from '../lib/format';
import { kindLabel, parseQty, roundQty } from '../lib/stock';
import type { Method, StockEntry, StockItem, StockKind } from '../lib/types';
import { colors, radius } from '../theme';
import { Name } from './ByLine';
import { Segmented } from './Segmented';

export const STOCK_KIND_COLOR: Record<StockKind, string> = {
  in: '#15803D',
  out: '#1864AB',
  left: '#B45309',
  staff: '#6D28D9',
};

const STAFF_GRAMS = [100, 150, 200, 250];

export type StockModalTarget = { item: StockItem; kind: StockKind; entry?: StockEntry } | null;

type Props = {
  target: StockModalTarget;
  userName: string;
  /** "Sun, 22 Nov" when adding to a day other than today. */
  dayNote?: string;
  onClose: () => void;
  onSave: (item: StockItem, input: StockEntryInput, entry?: StockEntry) => Promise<void>;
  onDelete: (entry: StockEntry) => Promise<void>;
};

export function StockEntryModal({ target, ...rest }: Props) {
  return (
    <Modal visible={!!target} transparent animationType="fade" onRequestClose={rest.onClose}>
      {target && <StockForm key={target.entry?.uid ?? `${target.item.uid}-${target.kind}`} target={target} {...rest} />}
    </Modal>
  );
}

function StockForm({ target, userName, dayNote, onClose, onSave, onDelete }: Props & { target: NonNullable<StockModalTarget> }) {
  const { item, entry } = target;
  const [kind, setKind] = useState<StockKind>(entry?.kind ?? target.kind);
  const isStaff = kind === 'staff';
  const [qty, setQty] = useState(() => {
    if (!entry) return '';
    return String(entry.kind === 'staff' ? Math.round(entry.qty * 1000) : roundQty(entry.qty));
  });
  const [paid, setPaid] = useState(entry?.paid_amount != null ? String(entry.paid_amount) : '');
  const [method, setMethod] = useState<Method>(entry?.paid_method ?? 'cash');
  const [note, setNote] = useState(entry?.note ?? '');
  const [saving, setSaving] = useState(false);
  const color = STOCK_KIND_COLOR[kind];
  const canPay = kind === 'in' && item.grp !== 'cooked';
  const unit = isStaff ? 'g' : item.unit;

  const save = async () => {
    const n = parseQty(qty);
    if (n == null) return Alert.alert(isStaff ? 'Enter the portion in grams' : `Enter how much (in ${item.unit})`);
    const amount = paid ? Number(paid) : 0;
    if (paid && (!Number.isInteger(amount) || amount <= 0)) return Alert.alert('Enter the amount paid in rupees, or leave it empty');
    if (saving) return;
    setSaving(true);
    try {
      await onSave(
        item,
        { kind, qty: isStaff ? roundQty(n / 1000) : n, note, paid: canPay && amount > 0 ? { amount, method } : null },
        entry,
      );
      onClose();
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
      <View style={styles.sheet}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          <Text style={styles.title} numberOfLines={2}>
            {item.name}
          </Text>
          <Text style={[styles.kind, { color }]}>
            {kindLabel(item.grp, kind)}
            {isStaff ? ' portion' : ''}
            {!entry && dayNote ? ` · on ${dayNote}` : ''}
          </Text>
          <Text style={styles.who}>
            {entry ? (
              <>
                Added by <Name>{entry.created_by || 'unknown'}</Name> at {formatTime(entry.created_at)}
              </>
            ) : (
              <>
                Saved as: <Name>{userName}</Name>
              </>
            )}
          </Text>

          {item.grp === 'home' && (
            <Segmented<StockKind>
              options={[
                { value: 'in', label: 'Bought' },
                { value: 'out', label: 'Sent to shop' },
              ]}
              value={kind}
              onChange={setKind}
            />
          )}

          <View style={styles.qtyRow}>
            <TextInput
              value={qty}
              onChangeText={(t) => setQty(t.replace(isStaff ? /[^0-9]/g : /[^0-9.,]/g, ''))}
              placeholder="0"
              keyboardType={isStaff ? 'number-pad' : 'decimal-pad'}
              autoFocus={!entry && !isStaff}
              style={[styles.qty, { color }]}
              maxLength={8}
            />
            <Text style={[styles.unit, { color }]}>{unit}</Text>
          </View>

          {isStaff && (
            <View style={styles.chips}>
              {STAFF_GRAMS.map((g) => (
                <Pressable
                  key={g}
                  onPress={() => setQty(String(g))}
                  style={[styles.chip, qty === String(g) && { backgroundColor: color, borderColor: color }]}
                >
                  <Text style={[styles.chipText, qty === String(g) && { color: colors.white }]}>{g} g</Text>
                </Pressable>
              ))}
            </View>
          )}

          {canPay && (
            <>
              <Text style={styles.label}>Paid ₹ (optional, also saves the expense)</Text>
              <View style={styles.row}>
                <TextInput
                  value={paid}
                  onChangeText={(t) => setPaid(t.replace(/[^0-9]/g, ''))}
                  placeholder="₹"
                  keyboardType="number-pad"
                  style={[styles.input, { flex: 1 }]}
                  maxLength={8}
                />
              </View>
              {paid ? (
                <Segmented<Method>
                  options={[
                    { value: 'cash', label: 'Cash' },
                    { value: 'bank', label: 'Bank / UPI' },
                  ]}
                  value={method}
                  onChange={setMethod}
                />
              ) : null}
            </>
          )}

          <Text style={styles.label}>Note (optional)</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder={isStaff ? 'e.g. Raju lunch' : canPay ? 'e.g. from Ramesh' : ''}
            style={styles.input}
          />

          <View style={styles.buttons}>
            <Pressable onPress={onClose} style={[styles.btn, styles.btnGhost]}>
              <Text style={[styles.btnText, { color: colors.text }]}>Cancel</Text>
            </Pressable>
            <Pressable onPress={save} disabled={saving} style={[styles.btn, { backgroundColor: color }]}>
              <Text style={styles.btnText}>Save</Text>
            </Pressable>
          </View>

          {entry && (
            <Pressable
              onPress={async () => {
                await onDelete(entry);
                onClose();
              }}
              style={styles.deleteBtn}
            >
              <Text style={styles.deleteText}>Delete{entry.paid_amount != null ? ' (and its expense)' : ''}</Text>
            </Pressable>
          )}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: 16, backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { backgroundColor: colors.card, borderRadius: radius.lg, maxHeight: '92%', width: '100%', maxWidth: 520, alignSelf: 'center' },
  content: { padding: 20, gap: 8 },
  title: { fontSize: 22, fontWeight: '900', color: colors.text },
  kind: { fontSize: 17, fontWeight: '800' },
  who: { fontSize: 14, color: colors.muted },
  qtyRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 2, borderBottomColor: colors.border, marginVertical: 6 },
  qty: { flex: 1, fontSize: 40, fontWeight: '900', paddingVertical: 6 },
  unit: { fontSize: 26, fontWeight: '900', marginLeft: 6 },
  label: { fontSize: 14, fontWeight: '700', color: colors.muted, marginTop: 6 },
  row: { flexDirection: 'row', gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 16, height: 44, borderRadius: 22, justifyContent: 'center', backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  chipText: { fontSize: 16, fontWeight: '800', color: colors.text },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 14, height: 52, fontSize: 17, color: colors.text, backgroundColor: colors.bg },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btn: { flex: 1, height: 54, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  btnGhost: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  btnText: { color: colors.white, fontSize: 17, fontWeight: '800' },
  deleteBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  deleteText: { color: colors.danger, fontSize: 16, fontWeight: '800' },
});
