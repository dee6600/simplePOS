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

import type { MoneyInput } from '../db/money';
import { EXPENSE_CATEGORIES } from '../lib/balance';
import { formatTime } from '../lib/format';
import type { Method, MoneyEntry, MoneyKind } from '../lib/types';
import { colors, radius } from '../theme';
import { Segmented } from './Segmented';

export const KIND_META: Record<MoneyKind, { title: string; editTitle: string; color: string; sign: '−' | '+'; notePlaceholder: string }> = {
  expense: { title: 'Add expense', editTitle: 'Edit expense', color: '#B91C1C', sign: '−', notePlaceholder: 'e.g. 25 kg rice from Ramesh' },
  in: { title: 'Add money', editTitle: 'Edit money added', color: '#15803D', sign: '+', notePlaceholder: 'e.g. Opening cash, loan from uncle' },
  out: { title: 'Take money out', editTitle: 'Edit money taken out', color: '#292524', sign: '−', notePlaceholder: 'e.g. Taken home, deposited in bank' },
};

export type MoneyModalTarget = { kind: MoneyKind; entry?: MoneyEntry } | null;

type Props = {
  target: MoneyModalTarget;
  userName: string;
  onClose: () => void;
  onSave: (input: MoneyInput, entry?: MoneyEntry) => Promise<void>;
  onDelete: (entry: MoneyEntry) => Promise<void>;
};

export function MoneyEntryModal({ target, ...rest }: Props) {
  return (
    <Modal visible={!!target} transparent animationType="fade" onRequestClose={rest.onClose}>
      {target && <MoneyForm key={target.entry?.uid ?? target.kind} target={target} {...rest} />}
    </Modal>
  );
}

function MoneyForm({ target, userName, onClose, onSave, onDelete }: Props & { target: NonNullable<MoneyModalTarget> }) {
  const { entry } = target;
  const [kind] = useState<MoneyKind>(entry?.kind ?? target.kind);
  const [amount, setAmount] = useState(entry ? String(entry.amount) : '');
  const [category, setCategory] = useState<string | null>(entry?.category ?? null);
  const [method, setMethod] = useState<Method>(entry?.method ?? 'cash');
  const [note, setNote] = useState(entry?.note ?? '');
  const [saving, setSaving] = useState(false);
  const meta = KIND_META[kind];

  const save = async () => {
    const n = Number(amount);
    if (!amount || !Number.isInteger(n) || n <= 0) return Alert.alert('Enter the amount in rupees');
    if (kind === 'expense' && !category) return Alert.alert('Choose what the money was spent on');
    if (saving) return;
    setSaving(true);
    try {
      await onSave({ kind, amount: n, method, category, note }, entry);
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
          <Text style={[styles.title, { color: meta.color }]}>{entry ? meta.editTitle : meta.title}</Text>
          <Text style={styles.who}>
            {entry
              ? `Added by ${entry.created_by || 'unknown'} at ${formatTime(entry.created_at)}${
                  entry.updated_by && entry.updated_by !== entry.created_by ? ` · last edited by ${entry.updated_by}` : ''
                }`
              : `Saved as: ${userName}`}
          </Text>

          <View style={styles.amountRow}>
            <Text style={[styles.rupee, { color: meta.color }]}>{meta.sign}₹</Text>
            <TextInput
              value={amount}
              onChangeText={(t) => setAmount(t.replace(/[^0-9]/g, ''))}
              placeholder="0"
              keyboardType="number-pad"
              autoFocus={!entry}
              style={[styles.amount, { color: meta.color }]}
              maxLength={8}
            />
          </View>

          {kind === 'expense' && (
            <>
              <Text style={styles.label}>Spent on</Text>
              <View style={styles.chips}>
                {EXPENSE_CATEGORIES.map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => setCategory(c)}
                    style={[styles.chip, category === c && { backgroundColor: meta.color, borderColor: meta.color }]}
                    accessibilityState={{ selected: category === c }}
                  >
                    <Text style={[styles.chipText, category === c && { color: colors.white }]}>{c}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          <Text style={styles.label}>{kind === 'in' ? 'Added to' : 'Paid from'}</Text>
          <Segmented<Method>
            options={[
              { value: 'cash', label: 'Cash' },
              { value: 'bank', label: 'Bank / UPI' },
            ]}
            value={method}
            onChange={setMethod}
          />

          <Text style={styles.label}>Note (optional)</Text>
          <TextInput value={note} onChangeText={setNote} placeholder={meta.notePlaceholder} style={styles.input} />

          <View style={styles.buttons}>
            <Pressable onPress={onClose} style={[styles.btn, styles.btnGhost]}>
              <Text style={[styles.btnText, { color: colors.text }]}>Cancel</Text>
            </Pressable>
            <Pressable onPress={save} disabled={saving} style={[styles.btn, { backgroundColor: meta.color }]}>
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
              <Text style={styles.deleteText}>Delete</Text>
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
  title: { fontSize: 22, fontWeight: '900' },
  who: { fontSize: 14, color: colors.muted },
  amountRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 2, borderBottomColor: colors.border, marginVertical: 6 },
  rupee: { fontSize: 34, fontWeight: '900', marginRight: 4 },
  amount: { flex: 1, fontSize: 40, fontWeight: '900', paddingVertical: 6 },
  label: { fontSize: 14, fontWeight: '700', color: colors.muted, marginTop: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, height: 44, borderRadius: 22, justifyContent: 'center', backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  chipText: { fontSize: 15, fontWeight: '700', color: colors.text },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 14, height: 52, fontSize: 17, color: colors.text, backgroundColor: colors.bg },
  buttons: { flexDirection: 'row', gap: 10, marginTop: 14 },
  btn: { flex: 1, height: 54, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  btnGhost: { backgroundColor: colors.bg, borderWidth: 1, borderColor: colors.border },
  btnText: { color: colors.white, fontSize: 17, fontWeight: '800' },
  deleteBtn: { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  deleteText: { color: colors.danger, fontSize: 16, fontWeight: '800' },
});
