import React, { useState } from 'react';
import { View, TextInput, Text as NativeText, Pressable, StyleSheet, ScrollView, Keyboard } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Category, CATEGORY_LABELS, TransactionType } from '../types/transaction';
import { useTransactionStore } from '../store/useTransactionStore';
import { useTranslation } from '../utils/translations';
import { ThemedText } from '../utils/theme';

const Text = ThemedText;

const CATEGORIES = Object.keys(CATEGORY_LABELS) as Category[];

export default function TransactionForm({ onDone }: { onDone?: () => void }) {
  const addTransaction = useTransactionStore((s) => s.addTransaction);
  const { t } = useTranslation();

  const [amount, setAmount] = useState('');
  const [type, setType] = useState<TransactionType>('gasto');
  const [category, setCategory] = useState<Category>('comida');
  const [note, setNote] = useState('');
  const [amountError, setAmountError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    const numericAmount = parseFloat(amount.replace(',', '.'));
    // Validación básica: no dejar guardar montos vacíos, negativos o no numéricos
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setAmountError('Ingresa un monto mayor que cero.');
      return;
    }

    setAmountError('');
    setIsSubmitting(true);

    try {
      await addTransaction({
        amount: numericAmount,
        type,
        category,
        date: new Date().toISOString(),
        note: note.trim() || undefined,
      });

      Keyboard.dismiss();
      setAmount('');
      setNote('');
      onDone?.();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.form}>
      <View style={styles.typeSwitch}>
        <Pressable
          style={[styles.typeButton, type === 'gasto' && styles.typeButtonActiveExpense]}
          onPress={() => setType('gasto')}
        >
          <View style={styles.typeButtonContent}>
            <MaterialCommunityIcons
              name="trending-down"
              size={18}
              color={type === 'gasto' ? '#FFFFFF' : '#64748B'}
            />
            <Text style={type === 'gasto' ? styles.typeTextActive : styles.typeText}>{t('Gastos')}</Text>
          </View>
        </Pressable>
        <Pressable
          style={[styles.typeButton, type === 'ingreso' && styles.typeButtonActiveIncome]}
          onPress={() => setType('ingreso')}
        >
          <View style={styles.typeButtonContent}>
            <MaterialCommunityIcons
              name="trending-up"
              size={18}
              color={type === 'ingreso' ? '#FFFFFF' : '#64748B'}
            />
            <Text style={type === 'ingreso' ? styles.typeTextActive : styles.typeText}>{t('Ingresos')}</Text>
          </View>
        </Pressable>
      </View>

      <View style={styles.inputContainer}>
        <MaterialCommunityIcons name="currency-usd" size={20} color="#64748B" style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          placeholder="Monto"
          accessibilityLabel="Monto"
          keyboardType="decimal-pad"
          returnKeyType="next"
          value={amount}
          onChangeText={(value) => {
            setAmount(value.replace(/[^0-9.,]/g, ''));
            if (amountError) setAmountError('');
          }}
          onBlur={() => {
            const numericAmount = parseFloat(amount.replace(',', '.'));
            if (amount && (!Number.isFinite(numericAmount) || numericAmount <= 0)) {
              setAmountError('Ingresa un monto mayor que cero.');
            }
          }}
          placeholderTextColor="#94A3B8"
        />
      </View>
      {amountError ? <Text style={styles.errorText}>{amountError}</Text> : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
        {CATEGORIES.map((c) => (
          <Pressable
            key={c}
            style={[styles.categoryChip, category === c && styles.categoryChipActive]}
            onPress={() => setCategory(c)}
          >
            <View style={styles.categoryChipContent}>
              <MaterialCommunityIcons
                name={CATEGORY_LABELS[c].emoji === '💰' ? 'cash' : 'tag-outline'}
                size={16}
                color={category === c ? '#4F46E5' : '#64748B'}
              />
              <Text style={[styles.categoryChipText, category === c && styles.categoryChipTextActive]}>
                {t(CATEGORY_LABELS[c].label)}
              </Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.inputContainer}>
        <MaterialCommunityIcons name="note-text-outline" size={20} color="#64748B" style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          placeholder="Nota (opcional)"
          accessibilityLabel="Nota opcional"
          returnKeyType="done"
          value={note}
          onChangeText={setNote}
          onSubmitEditing={Keyboard.dismiss}
          placeholderTextColor="#94A3B8"
        />
      </View>

      <Pressable style={[styles.submitButton, isSubmitting && styles.disabledButton]} onPress={handleSubmit} disabled={isSubmitting}>
        <Text style={styles.submitText}>{isSubmitting ? 'Guardando...' : 'Guardar'}</Text>
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
  typeButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  typeButtonActiveExpense: { backgroundColor: '#EF4444' },
  typeButtonActiveIncome: { backgroundColor: '#10B981' },
  typeText: { color: '#5A5A66' },
  typeTextActive: { color: '#FFFFFF', fontWeight: '700' },
  input: {
    flex: 1,
    padding: 12,
    fontSize: 15,
    color: '#0F172A',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E4E4EC',
    borderRadius: 12,
    paddingHorizontal: 12,
    marginBottom: 16,
    backgroundColor: '#FFFFFF',
    height: 50,
  },
  inputIcon: {
    marginRight: 10,
  },
  categoryScroll: { marginBottom: 16 },
  categoryChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F0F0F5',
    borderRadius: 20,
    marginRight: 8,
  },
  categoryChipContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  categoryChipText: {
    fontSize: 13,
    color: '#64748B',
  },
  categoryChipTextActive: {
    color: '#4F46E5',
    fontWeight: '700',
  },
  categoryChipActive: { backgroundColor: '#E0E7FF' },
  submitButton: {
    backgroundColor: '#6366F1',
    padding: 14,
    borderRadius: 10,
    alignItems: 'center',
  },
  submitText: { color: '#FFFFFF', fontWeight: '700' },
  disabledButton: { opacity: 0.6 },
  errorText: { color: '#EF4444', fontSize: 12, marginTop: -10, marginBottom: 12 },
});
