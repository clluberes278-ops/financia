import React, { useState } from 'react';
import { View, TextInput, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { Category, CATEGORY_LABELS, TransactionType } from '../types/transaction';
import { useTransactionStore } from '../store/useTransactionStore';

const CATEGORIES = Object.keys(CATEGORY_LABELS) as Category[];

export default function TransactionForm({ onDone }: { onDone?: () => void }) {
  const addTransaction = useTransactionStore((s) => s.addTransaction);

  const [amount, setAmount] = useState('');
  const [type, setType] = useState<TransactionType>('gasto');
  const [category, setCategory] = useState<Category>('comida');
  const [note, setNote] = useState('');

  const handleSubmit = async () => {
    const numericAmount = parseFloat(amount.replace(',', '.'));
    // Validación básica: no dejar guardar montos vacíos, negativos o no numéricos
    if (isNaN(numericAmount) || numericAmount <= 0) return;

    await addTransaction({
      amount: numericAmount,
      type,
      category,
      date: new Date().toISOString(),
      note: note.trim() || undefined,
    });

    setAmount('');
    setNote('');
    onDone?.();
  };

  return (
    <View style={styles.form}>
      <View style={styles.typeSwitch}>
        <Pressable
          style={[styles.typeButton, type === 'gasto' && styles.typeButtonActiveExpense]}
          onPress={() => setType('gasto')}
        >
          <Text style={type === 'gasto' ? styles.typeTextActive : styles.typeText}>Gasto</Text>
        </Pressable>
        <Pressable
          style={[styles.typeButton, type === 'ingreso' && styles.typeButtonActiveIncome]}
          onPress={() => setType('ingreso')}
        >
          <Text style={type === 'ingreso' ? styles.typeTextActive : styles.typeText}>Ingreso</Text>
        </Pressable>
      </View>

      <TextInput
        style={styles.input}
        placeholder="Monto"
        keyboardType="decimal-pad"
        value={amount}
        onChangeText={setAmount}
      />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
        {CATEGORIES.map((c) => (
          <Pressable
            key={c}
            style={[styles.categoryChip, category === c && styles.categoryChipActive]}
            onPress={() => setCategory(c)}
          >
            <Text>
              {CATEGORY_LABELS[c].emoji} {CATEGORY_LABELS[c].label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <TextInput
        style={styles.input}
        placeholder="Nota (opcional)"
        value={note}
        onChangeText={setNote}
      />

      <Pressable style={styles.submitButton} onPress={handleSubmit}>
        <Text style={styles.submitText}>Guardar</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { padding: 16, backgroundColor: '#FFFFFF', borderRadius: 16 },
  typeSwitch: { flexDirection: 'row', marginBottom: 16, gap: 8 },
  typeButton: {
    flex: 1,
    padding: 10,
    borderRadius: 10,
    backgroundColor: '#F0F0F5',
    alignItems: 'center',
  },
  typeButtonActiveExpense: { backgroundColor: '#F87171' },
  typeButtonActiveIncome: { backgroundColor: '#4ADE80' },
  typeText: { color: '#5A5A66' },
  typeTextActive: { color: '#FFFFFF', fontWeight: '700' },
  input: {
    borderWidth: 1,
    borderColor: '#E4E4EC',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  categoryScroll: { marginBottom: 12 },
  categoryChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F0F0F5',
    borderRadius: 20,
    marginRight: 8,
  },
  categoryChipActive: { backgroundColor: '#C7C7F5' },
  submitButton: {
    backgroundColor: '#6366F1',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  submitText: { color: '#FFFFFF', fontWeight: '700' },
});
