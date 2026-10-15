import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
  Platform,
  Alert,
} from 'react-native';
import {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Category, CATEGORY_LABELS, TransactionType } from '../types/transaction';
import { useTransactionStore } from '../store/useTransactionStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useTranslation } from '../utils/translations';
import { getThemeColors, ThemedText } from '../utils/theme';

import type { TransactionBottomSheetProps } from '../types/app';

const CATEGORIES = Object.keys(CATEGORY_LABELS) as Category[];
const Text = ThemedText;

export default function TransactionBottomSheet({
  bottomSheetRef,
  initialType = 'gasto',
}: TransactionBottomSheetProps) {
  const addTransaction = useTransactionStore((s) => s.addTransaction);
  const accentColor = useSettingsStore((s) => s.accentColor);
  const appTheme = useSettingsStore((s) => s.theme);
  const cardColor = useSettingsStore((s) => s.cardColor);
  const theme = getThemeColors(appTheme, cardColor);
  const { t } = useTranslation();

  const [type, setType] = useState<TransactionType>(initialType);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<Category>(
    initialType === 'ingreso' ? 'salario' : 'comida'
  );
  const [note, setNote] = useState('');
  const [amountError, setAmountError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setType(initialType);
    setCategory(initialType === 'ingreso' ? 'salario' : 'comida');
  }, [initialType]);

  const handleSubmit = async () => {
    const numericAmount = parseFloat(amount.replace(',', '.'));
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
      bottomSheetRef.current?.dismiss();
    } catch {
      Alert.alert(t('Error'), t('No se pudo guardar el movimiento. Inténtalo de nuevo.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.5}
      />
    ),
    []
  );

  return (
    <BottomSheetModal
      ref={bottomSheetRef}
      index={0}
      snapPoints={['65%']}
      backdropComponent={renderBackdrop}
      enablePanDownToClose
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <BottomSheetView style={[styles.contentContainer, { backgroundColor: theme.surface }]}>
        <View style={styles.handleBar} />

        <View style={styles.header}>
          <View>
            <Text style={[styles.title, { color: theme.text }]}>{t('Registrar Movimiento')}</Text>
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Financia Smart Bank</Text>
          </View>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1 }}
        >
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
                style={[styles.categoryChip, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }, category === c && { backgroundColor: `${accentColor}18`, borderColor: accentColor }]}
                onPress={() => setCategory(c)}
              >
                <View style={styles.categoryChipContent}>
                  <MaterialCommunityIcons
                    name={CATEGORY_LABELS[c].emoji === '💰' ? 'cash' : 'tag-outline'}
                    size={16}
                    color={category === c ? accentColor : theme.textSecondary}
                  />
                  <Text style={[styles.categoryChipText, { color: theme.textSecondary }, category === c && { color: accentColor }]}>
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

          <Pressable
            style={[styles.submitButton, isSubmitting && styles.submitButtonDisabled]}
            onPress={handleSubmit}
            disabled={isSubmitting}
          >
            <LinearGradient colors={[accentColor, theme.heroEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.submitGradient}>
              <Text style={styles.submitText}>{isSubmitting ? 'Guardando...' : 'Guardar'}</Text>
            </LinearGradient>
          </Pressable>
        </KeyboardAvoidingView>
        </BottomSheetView>
      </TouchableWithoutFeedback>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  contentContainer: {
    flex: 1,
    paddingHorizontal: 22,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  handleBar: {
    width: 44,
    height: 5,
    backgroundColor: '#C4B5FD',
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 18,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
  typeSwitch: {
    flexDirection: 'row',
    marginBottom: 20,
    gap: 8,
  },
  typeButton: {
    flex: 1,
    padding: 12,
    borderRadius: 16,
    backgroundColor: '#F0F0F5',
    alignItems: 'center',
  },
  typeButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  typeTextActive: { color: '#FFFFFF', fontWeight: '700' },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    marginBottom: 16,
    height: 50,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#0F172A',
  },
  categoryScroll: { marginBottom: 20 },
  categoryChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F0F0F5',
    borderRadius: 16,
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
    borderRadius: 17,
    overflow: 'hidden',
    marginTop: 10,
    marginBottom: 20,
  },
  submitGradient: {
    padding: 16,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  errorText: {
    fontSize: 12,
    marginTop: -10,
    marginBottom: 12,
  },
  submitText: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },
});
