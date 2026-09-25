import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { Category, CATEGORY_LABELS, TransactionType } from '../types/transaction';
import { useTransactionStore } from '../store/useTransactionStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { useTranslation } from '../utils/translations';

interface TransactionModalProps {
  visible: boolean;
  onClose: () => void;
  initialType?: TransactionType;
}

const CATEGORIES = Object.keys(CATEGORY_LABELS) as Category[];
const QUICK_AMOUNTS = [100, 500, 1000, 5000];

export default function TransactionModal({
  visible,
  onClose,
  initialType = 'gasto',
}: TransactionModalProps) {
  const addTransaction = useTransactionStore((s) => s.addTransaction);
  const accentColor = useSettingsStore((s) => s.accentColor);
  const { t } = useTranslation();

  const [type, setType] = useState<TransactionType>(initialType);
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<Category>(
    initialType === 'ingreso' ? 'salario' : 'comida'
  );
  const [note, setNote] = useState('');

  // Sincronizar tipo cuando cambia initialType
  React.useEffect(() => {
    setType(initialType);
    setCategory(initialType === 'ingreso' ? 'salario' : 'comida');
  }, [initialType, visible]);

  const handleTypeChange = (newType: TransactionType) => {
    setType(newType);
    if (newType === 'ingreso' && category !== 'salario' && category !== 'otros') {
      setCategory('salario');
    } else if (newType === 'gasto' && category === 'salario') {
      setCategory('comida');
    }
  };

  const handleAddQuickAmount = (val: number) => {
    const current = parseFloat(amount.replace(',', '.')) || 0;
    setAmount((current + val).toString());
  };

  const handleSubmit = async () => {
    const numericAmount = parseFloat(amount.replace(',', '.'));
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
    onClose();
  };

  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.backdrop}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.keyboardContainer}
          >
            <View style={styles.sheet}>
              {/* Barra indicadora superior */}
              <View style={styles.handleBar} />

              {/* Encabezado */}
              <View style={styles.header}>
                <View>
                  <Text style={styles.title}>{t('Registrar Movimiento')}</Text>
                  <Text style={styles.subtitle}>Financia Smart Bank</Text>
                </View>
                <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={12}>
                  <Text style={styles.closeBtnText}>✕</Text>
                </Pressable>
              </View>

              {/* Selector de Tipo (Gasto / Ingreso) */}
              <View style={styles.typeSelectorContainer}>
                <Pressable
                  style={[
                    styles.typeOption,
                    type === 'gasto' && styles.typeOptionExpenseActive,
                  ]}
                  onPress={() => handleTypeChange('gasto')}
                >
                  <Text
                    style={[
                      styles.typeOptionText,
                      type === 'gasto' && styles.typeOptionTextActive,
                    ]}
                  >
                    📉 Gasto
                  </Text>
                </Pressable>
                <Pressable
                  style={[
                    styles.typeOption,
                    type === 'ingreso' && styles.typeOptionIncomeActive,
                  ]}
                  onPress={() => handleTypeChange('ingreso')}
                >
                  <Text
                    style={[
                      styles.typeOptionText,
                      type === 'ingreso' && styles.typeOptionTextActive,
                    ]}
                  >
                    📈 Ingreso
                  </Text>
                </Pressable>
              </View>

              {/* Campo de Monto Principal */}
              <View style={styles.amountBox}>
                <Text style={styles.currencyPrefix}>RD$</Text>
                <TextInput
                  style={styles.amountInput}
                  placeholder="0.00"
                  placeholderTextColor="#94A3B8"
                  keyboardType="decimal-pad"
                  value={amount}
                  onChangeText={setAmount}
                  autoFocus={false}
                />
              </View>

              {/* Botones de incremento rápido */}
              <View style={styles.quickAmountsRow}>
                {QUICK_AMOUNTS.map((val) => (
                  <Pressable
                    key={val}
                    style={[styles.quickAmountBadge, { borderColor: accentColor }]}
                    onPress={() => handleAddQuickAmount(val)}
                  >
                    <Text style={[styles.quickAmountText, { color: accentColor }]}>+{val.toLocaleString()}</Text>
                  </Pressable>
                ))}
              </View>

              {/* Selector de Categorías */}
                <Text style={styles.sectionLabel}>{t('Categoría')}</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.categoriesScroll}
                contentContainerStyle={styles.categoriesContent}
              >
                {CATEGORIES.map((c) => {
                  const isSelected = category === c;
                  return (
                    <Pressable
                      key={c}
                      style={[
                        styles.categoryChip,
                        isSelected && (type === 'gasto' ? styles.chipActiveExpense : styles.chipActiveIncome),
                      ]}
                      onPress={() => setCategory(c)}
                    >
                      <Text style={styles.categoryEmoji}>{CATEGORY_LABELS[c].emoji}</Text>
                      <Text
                        style={[
                          styles.categoryName,
                          isSelected && styles.categoryNameActive,
                        ]}
                      >
                        {t(CATEGORY_LABELS[c].label)}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {/* Campo de Nota / Concepto */}
              <Text style={styles.sectionLabel}>{t('Concepto o detalle')}</Text>
              <TextInput
                style={styles.noteInput}
                placeholder={t('Ej. Supermercado, Pago de nómina, Uber...')}
                placeholderTextColor="#94A3B8"
                value={note}
                onChangeText={setNote}
                maxLength={45}
              />

              {/* Botón Guardar */}
              <Pressable
                style={({ pressed }) => [
                  styles.saveButton,
                  type === 'ingreso' ? styles.saveButtonIncome : styles.saveButtonExpense,
                  type === 'gasto' && { backgroundColor: accentColor },
                  pressed && styles.buttonPressed,
                ]}
                onPress={handleSubmit}
              >
                <Text style={styles.saveButtonText}>
                  {type === 'ingreso' ? t('Guardar Ingreso') : t('Guardar Gasto')}
                </Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  keyboardContainer: {
    width: '100%',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 34 : 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 20,
  },
  handleBar: {
    width: 44,
    height: 5,
    backgroundColor: '#E2E8F0',
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
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
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 15,
    color: '#475569',
    fontWeight: '700',
  },
  typeSelectorContainer: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    padding: 4,
    marginBottom: 16,
    gap: 6,
  },
  typeOption: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeOptionExpenseActive: {
    backgroundColor: '#EF4444',
  },
  typeOptionIncomeActive: {
    backgroundColor: '#10B981',
  },
  typeOptionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748B',
  },
  typeOptionTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  amountBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 10,
  },
  currencyPrefix: {
    fontSize: 20,
    fontWeight: '800',
    color: '#6366F1',
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    fontSize: 28,
    fontWeight: '800',
    color: '#0F172A',
    padding: 0,
  },
  quickAmountsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    gap: 8,
  },
  quickAmountBadge: {
    flex: 1,
    paddingVertical: 6,
    backgroundColor: '#EEF2FF',
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  quickAmountText: {
    color: '#4F46E5',
    fontWeight: '700',
    fontSize: 12,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  categoriesScroll: {
    marginBottom: 16,
  },
  categoriesContent: {
    gap: 8,
    paddingRight: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  chipActiveExpense: {
    backgroundColor: '#FEE2E2',
    borderColor: '#EF4444',
  },
  chipActiveIncome: {
    backgroundColor: '#D1FAE5',
    borderColor: '#10B981',
  },
  categoryEmoji: {
    fontSize: 16,
  },
  categoryName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  categoryNameActive: {
    color: '#0F172A',
    fontWeight: '800',
  },
  noteInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#0F172A',
    marginBottom: 20,
  },
  saveButton: {
    paddingVertical: 15,
    borderRadius: 14,
    alignItems: 'center',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  saveButtonExpense: {
    backgroundColor: '#EF4444',
  },
  saveButtonIncome: {
    backgroundColor: '#10B981',
  },
  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
