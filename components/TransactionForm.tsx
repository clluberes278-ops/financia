import React, { useState } from 'react';
import { Alert, View, TextInput, Pressable, StyleSheet, ScrollView, Keyboard } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Category, CATEGORY_LABELS, TransactionType } from '../types/transaction';
import { useTransactionStore } from '../store/useTransactionStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useTranslation } from '../utils/translations';
import { getThemeColors, ThemedText } from '../utils/theme';

const Text = ThemedText;

const CATEGORIES = Object.keys(CATEGORY_LABELS) as Category[];

export default function TransactionForm({ onDone }: { onDone?: () => void }) {
  const addTransaction = useTransactionStore((s) => s.addTransaction);
  const accentColor = useSettingsStore((s) => s.accentColor);
  const appTheme = useSettingsStore((s) => s.theme);
  const cardColor = useSettingsStore((s) => s.cardColor);
  const theme = getThemeColors(appTheme, cardColor);
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
    } catch {
      Alert.alert(t('Error'), t('No se pudo guardar el movimiento. Inténtalo de nuevo.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={[styles.form, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={styles.typeSwitch}>
        <Pressable
          style={[
            styles.typeButton,
            { backgroundColor: theme.surfaceMuted },
            type === 'gasto' && { backgroundColor: theme.expense },
          ]}
          onPress={() => setType('gasto')}
        >
          <View style={styles.typeButtonContent}>
            <MaterialCommunityIcons
              name="trending-down"
              size={18}
              color={type === 'gasto' ? '#FFFFFF' : theme.textSecondary}
            />
            <Text style={type === 'gasto' ? styles.typeTextActive : { color: theme.textSecondary }}>{t('Gastos')}</Text>
          </View>
        </Pressable>
        <Pressable
          style={[
            styles.typeButton,
            { backgroundColor: theme.surfaceMuted },
            type === 'ingreso' && { backgroundColor: theme.income },
          ]}
          onPress={() => setType('ingreso')}
        >
          <View style={styles.typeButtonContent}>
            <MaterialCommunityIcons
              name="trending-up"
              size={18}
              color={type === 'ingreso' ? '#FFFFFF' : theme.textSecondary}
            />
            <Text style={type === 'ingreso' ? styles.typeTextActive : { color: theme.textSecondary }}>{t('Ingresos')}</Text>
          </View>
        </Pressable>
      </View>

      <View style={[styles.inputContainer, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]}>
        <MaterialCommunityIcons name="currency-usd" size={20} color={theme.textSecondary} style={styles.inputIcon} />
        <TextInput
          style={[styles.input, { color: theme.text }]}
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
          placeholderTextColor={theme.textMuted}
        />
      </View>
      {amountError ? <Text style={[styles.errorText, { color: theme.expense }]}>{amountError}</Text> : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
        {CATEGORIES.map((c) => (
          <Pressable
            key={c}
            style={[
              styles.categoryChip,
              { backgroundColor: theme.surfaceMuted, borderColor: theme.border },
              category === c && { backgroundColor: `${accentColor}18`, borderColor: accentColor },
            ]}
            onPress={() => setCategory(c)}
          >
            <View style={styles.categoryChipContent}>
              <MaterialCommunityIcons
                name={CATEGORY_LABELS[c].emoji === '💰' ? 'cash' : 'tag-outline'}
                size={16}
                color={category === c ? accentColor : theme.textSecondary}
              />
              <Text style={[styles.categoryChipText, { color: theme.textSecondary }, category === c && { color: accentColor, fontWeight: '700' }]}>
                {t(CATEGORY_LABELS[c].label)}
              </Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>

      <View style={[styles.inputContainer, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]}>
        <MaterialCommunityIcons name="note-text-outline" size={20} color={theme.textSecondary} style={styles.inputIcon} />
        <TextInput
          style={[styles.input, { color: theme.text }]}
          placeholder="Nota (opcional)"
          accessibilityLabel="Nota opcional"
          returnKeyType="done"
          value={note}
          onChangeText={setNote}
          onSubmitEditing={Keyboard.dismiss}
          placeholderTextColor={theme.textMuted}
        />
      </View>

      <Pressable style={[styles.submitButton, isSubmitting && styles.disabledButton]} onPress={handleSubmit} disabled={isSubmitting}>
        <LinearGradient colors={[accentColor, theme.heroEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.submitGradient}>
          <Text style={styles.submitText}>{isSubmitting ? 'Guardando...' : 'Guardar'}</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { padding: 18, borderRadius: 24, borderWidth: 1 },
  typeSwitch: { flexDirection: 'row', marginBottom: 16, gap: 8 },
  typeButton: {
    flex: 1,
    padding: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  typeButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  typeTextActive: { color: '#FFFFFF', fontWeight: '700' },
  input: {
    flex: 1,
    padding: 12,
    fontSize: 15,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 15,
    paddingHorizontal: 12,
    marginBottom: 16,
    height: 50,
  },
  inputIcon: {
    marginRight: 10,
  },
  categoryScroll: { marginBottom: 16 },
  categoryChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 15,
    marginRight: 8,
    borderWidth: 1,
  },
  categoryChipContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  categoryChipText: {
    fontSize: 13,
  },
  submitButton: { borderRadius: 16, overflow: 'hidden' },
  submitGradient: { padding: 15, alignItems: 'center' },
  submitText: { color: '#FFFFFF', fontWeight: '700' },
  disabledButton: { opacity: 0.6 },
  errorText: { fontSize: 12, marginTop: -10, marginBottom: 12 },
});
