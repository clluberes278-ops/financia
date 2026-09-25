import React, { useEffect, useState } from 'react';
import {
  View,
  Text as NativeText,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { useSavingsStore } from '../store/useSavingsStore';
import { useTransactionStore } from '../store/useTransactionStore';
import { SavingsPocket } from '../types/savings';
import { formatCurrency, calculateBalance } from '../utils/calculations';
import { useSettingsStore } from '../store/useSettingsStore';
import { useTranslation } from '../utils/translations';
import { getThemeColors, ThemedText } from '../utils/theme';

const POPULAR_EMOJIS = ['📱', '🚗', '🛡️', '🏖️', '💻', '🏠', '🎓', '🎁', '🎮', '🐖'];
const QUICK_AMOUNTS = [500, 1000, 2000, 5000];
const Text = ThemedText;

export default function SavingsScreen() {
  const { pockets, isLoaded, loadPockets, createPocket, depositToPocket, withdrawFromPocket, deletePocket } =
    useSavingsStore();
  const { transactions, addTransaction } = useTransactionStore();
  const accentColor = useSettingsStore((state) => state.accentColor);
  const appTheme = useSettingsStore((state) => state.theme);
  const theme = getThemeColors(appTheme);
  const { t } = useTranslation();

  const mainBalance = calculateBalance(transactions);

  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newPocketName, setNewPocketName] = useState('');
  const [newPocketTarget, setNewPocketTarget] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState('📱');

  // Modal para abonar o retirar
  const [actionModalVisible, setActionModalVisible] = useState(false);
  const [selectedPocket, setSelectedPocket] = useState<SavingsPocket | null>(null);
  const [actionType, setActionType] = useState<'abonar' | 'retirar'>('abonar');
  const [actionAmount, setActionAmount] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  useEffect(() => {
    if (!isLoaded) loadPockets();
  }, [isLoaded]);

  const totalSaved = pockets.reduce((acc, p) => acc + p.currentAmount, 0);
  const totalTarget = pockets.reduce((acc, p) => acc + p.targetAmount, 0);
  const globalProgress = totalTarget > 0 ? Math.min(100, Math.round((totalSaved / totalTarget) * 100)) : 0;

  const handleCreatePocket = async () => {
    const target = parseFloat(newPocketTarget.replace(',', '.'));
    if (!newPocketName.trim()) {
      Alert.alert('Falta información', 'Por favor ingresa un nombre para la meta o bolsillo.');
      return;
    }
    if (isNaN(target) || target <= 0) {
      Alert.alert('Monto inválido', 'Por favor ingresa una meta fija válida en pesos.');
      return;
    }

    setIsCreating(true);
    try {
      await createPocket({
        name: newPocketName.trim(),
        targetAmount: target,
        emoji: selectedEmoji,
      });

      Keyboard.dismiss();
      setNewPocketName('');
      setNewPocketTarget('');
      setSelectedEmoji('📱');
      setCreateModalVisible(false);
    } finally {
      setIsCreating(false);
    }
  };

  const handleOpenActionModal = (pocket: SavingsPocket, type: 'abonar' | 'retirar') => {
    setSelectedPocket(pocket);
    setActionType(type);
    setActionAmount('');
    setActionModalVisible(true);
  };

  const handleConfirmAction = async () => {
    if (!selectedPocket) return;
    const amount = parseFloat(actionAmount.replace(',', '.'));
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Monto inválido', 'Ingresa un monto válido.');
      return;
    }

    setIsProcessingAction(true);

    try {
      if (actionType === 'abonar') {
        if (amount > mainBalance) {
          Alert.alert(
            'Saldo insuficiente',
            `No tienes suficiente saldo disponible en tu cuenta principal (${formatCurrency(mainBalance)}) para abonar ${formatCurrency(amount)}.`
          );
          return;
        }

        // 1. Agregar a los ahorros del bolsillo
        await depositToPocket(selectedPocket.id, amount);

        // 2. Restar de la cuenta principal registrando la salida hacia ahorro
        await addTransaction({
          amount,
          type: 'gasto',
          category: 'ahorro',
          date: new Date().toISOString(),
          note: `Abono a bolsillo: ${selectedPocket.name}`,
        });

        const newAmount = selectedPocket.currentAmount + amount;
        if (newAmount >= selectedPocket.targetAmount) {
          Alert.alert('🏆 ¡Meta Cumplida!', `¡Felicidades! Has completado tu meta para "${selectedPocket.name}".`);
        } else if (newAmount >= selectedPocket.targetAmount * 0.8) {
          Alert.alert('🔔 ¡A punto de llegar!', `Estás a un paso de alcanzar tu meta para "${selectedPocket.name}".`);
        }
      } else {
        if (amount > selectedPocket.currentAmount) {
          Alert.alert('Monto excesivo', `Solo tienes ${formatCurrency(selectedPocket.currentAmount)} en este bolsillo.`);
          return;
        }

        // 1. Retirar del bolsillo
        await withdrawFromPocket(selectedPocket.id, amount);

        // 2. Regresar a la cuenta principal como ingreso
        await addTransaction({
          amount,
          type: 'ingreso',
          category: 'ahorro',
          date: new Date().toISOString(),
          note: `Retiro de bolsillo: ${selectedPocket.name}`,
        });
      }

      Keyboard.dismiss();
      setActionModalVisible(false);
      setActionAmount('');
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleDeletePocket = (pocket: SavingsPocket) => {
    Alert.alert(
      'Eliminar Bolsillo',
      pocket.currentAmount > 0
        ? `El bolsillo "${pocket.name}" tiene ${formatCurrency(pocket.currentAmount)}. Al eliminarlo, estos fondos se devolverán automáticamente a tu cuenta principal.`
        : `¿Deseas eliminar el bolsillo "${pocket.name}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            if (pocket.currentAmount > 0) {
              await addTransaction({
                amount: pocket.currentAmount,
                type: 'ingreso',
                category: 'ahorro',
                date: new Date().toISOString(),
                note: `Devolución por bolsillo eliminado: ${pocket.name}`,
              });
            }
            await deletePocket(pocket.id);
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.screenWrapper, { backgroundColor: theme.background }]}>
      <ScrollView
        style={[styles.container, { backgroundColor: theme.background }]}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Tarjeta de Resumen Global de Bolsillos */}
        <View style={[styles.summaryCard, { backgroundColor: theme.header, borderColor: theme.border }]}>
          <View style={styles.summaryHeader}>
            <View>
              <Text style={styles.summaryBadgeTitle}>{t('BOLSAS & METAS DE AHORRO')}</Text>
              <Text style={styles.summaryMainAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>{formatCurrency(totalSaved)}</Text>
            </View>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{pockets.length} {pockets.length === 1 ? 'meta' : 'metas'}</Text>
            </View>
          </View>

          {totalTarget > 0 && (
            <View style={styles.summaryProgressSection}>
              <View style={styles.summaryProgressLabels}>
                <Text style={styles.summaryTargetText}>{t('Objetivo global')}: {formatCurrency(totalTarget)}</Text>
                <Text style={styles.summaryPercentText}>{globalProgress}%</Text>
              </View>
              <View style={styles.summaryBarBg}>
                <View style={[styles.summaryBarFill, { width: `${globalProgress}%` }]} />
              </View>
            </View>
          )}

          <Pressable
            style={[styles.newPocketPrimaryBtn, { backgroundColor: accentColor }]}
            onPress={() => setCreateModalVisible(true)}
          >
            <Text style={styles.newPocketPrimaryBtnText}>＋ {t('Crear Nuevo Bolsillo de Ahorro')}</Text>
          </Pressable>
        </View>

        {/* Listado de Bolsillos */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('Tus Cuentas de Ahorro')}</Text>
        </View>

        {pockets.length === 0 ? (
          <View style={[styles.emptyContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={styles.emptyCircle}>
              <Text style={styles.emptyIcon}>🎯</Text>
            </View>
            <Text style={styles.emptyHeading}>{t('Separa tu dinero con metas fijas')}</Text>
            <Text style={styles.emptySubheading}>
              Crea bolsillos específicos para no mezclar tu dinero: "Mi próximo celular",
              "Transporte", "Ahorro de emergencia" o "Vacaciones".
            </Text>
            <Pressable
              style={[styles.emptyCreateBtn, { backgroundColor: accentColor }]}
              onPress={() => setCreateModalVisible(true)}
            >
              <Text style={styles.emptyCreateBtnText}>＋ {t('Crear mi primer bolsillo')}</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.pocketsList}>
            {pockets.map((pocket) => {
              const progress = Math.min(100, Math.round((pocket.currentAmount / pocket.targetAmount) * 100));
              const isCompleted = pocket.currentAmount >= pocket.targetAmount;
              const isAlmostDone = !isCompleted && progress >= 80;

              return (
                <View key={pocket.id} style={[styles.pocketCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  {/* Encabezado del bolsillo */}
                  <View style={styles.pocketTopRow}>
                    <View style={styles.pocketTitleGroup}>
                      <View style={styles.pocketEmojiBox}>
                        <Text style={styles.pocketEmojiText}>{pocket.emoji}</Text>
                      </View>
                      <View style={styles.pocketTitleTextCol}>
                        <Text style={styles.pocketName} numberOfLines={1}>
                          {pocket.name}
                        </Text>
                        <Text style={styles.pocketTargetText} numberOfLines={1}>
                          Meta: {formatCurrency(pocket.targetAmount)}
                        </Text>
                      </View>
                    </View>

                    {/* Alerta compacta de progreso / meta */}
                    {isCompleted ? (
                      <View style={styles.badgeCompleted}>
                        <Text style={styles.badgeCompletedText}>🏆 100%</Text>
                      </View>
                    ) : isAlmostDone ? (
                      <View style={styles.badgeAlmost}>
                        <Text style={styles.badgeAlmostText}>🔔 {progress}%</Text>
                      </View>
                    ) : (
                      <View style={styles.badgeProgress}>
                        <Text style={styles.badgeProgressText}>{progress}%</Text>
                      </View>
                    )}
                  </View>

                  {/* Monto actual y faltante en columnas organizadas */}
                  <View style={styles.pocketAmountsRow}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={styles.pocketAmountLabel}>{t('Ahorrado')}</Text>
                      <Text style={styles.pocketCurrentAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                        {formatCurrency(pocket.currentAmount)}
                      </Text>
                    </View>
                    <View style={styles.pocketRemainingCol}>
                      <Text style={styles.pocketRemainingLabel}>{t('Estado')}</Text>
                      <Text style={styles.pocketRemaining} numberOfLines={1}>
                        {isCompleted
                          ? t('Completado')
                          : `${t('Falta')} ${formatCurrency(pocket.targetAmount - pocket.currentAmount)}`}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.pocketBarBg}>
                    <View
                      style={[
                        styles.pocketBarFill,
                        {
                          width: `${progress}%`,
                          backgroundColor: isCompleted ? '#10B981' : isAlmostDone ? '#F59E0B' : accentColor,
                        },
                      ]}
                    />
                  </View>

                  {/* Botones de Acción (Abonar / Retirar) */}
                  <View style={styles.pocketActionsRow}>
                    <Pressable
                      style={[styles.actionAbonarBtn, { borderColor: accentColor }]}
                      onPress={() => handleOpenActionModal(pocket, 'abonar')}
                    >
                      <Text style={[styles.actionAbonarText, { color: accentColor }]}>＋ {t('Abonar')}</Text>
                    </Pressable>

                    <Pressable
                      style={styles.actionRetirarBtn}
                      onPress={() => handleOpenActionModal(pocket, 'retirar')}
                    >
                      <Text style={styles.actionRetirarText}>− {t('Retirar')}</Text>
                    </Pressable>

                    <Pressable
                      style={styles.actionDeleteBtn}
                      hitSlop={8}
                      onPress={() => handleDeletePocket(pocket)}
                    >
                      <Text style={styles.actionDeleteText}>🗑️</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* MODAL: Crear Nuevo Bolsillo */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={createModalVisible}
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalBackdrop}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.modalKeyboardBox}
            >
              <View style={[styles.modalSheet, { backgroundColor: theme.surface }]}>
                <View style={[styles.modalHandle, { backgroundColor: theme.border }]} />

                  <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{t('Nuevo Bolsillo de Ahorro')}</Text>
                  <Pressable onPress={() => setCreateModalVisible(false)} style={[styles.modalCloseBtn, { backgroundColor: theme.surfaceMuted }]}>
                    <Text style={styles.modalCloseText}>✕</Text>
                  </Pressable>
                </View>

                {/* Selector de Emoji */}
                <Text style={styles.modalInputLabel}>{t('Ícono representativo')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.emojiScroll}>
                  {POPULAR_EMOJIS.map((emoji) => (
                    <Pressable
                      key={emoji}
                      style={[styles.emojiChip, selectedEmoji === emoji && styles.emojiChipActive, selectedEmoji === emoji && { borderColor: accentColor }]}
                      onPress={() => setSelectedEmoji(emoji)}
                    >
                      <Text style={styles.emojiChipText}>{emoji}</Text>
                    </Pressable>
                  ))}
                </ScrollView>

                {/* Nombre */}
                <Text style={styles.modalInputLabel}>{t('Nombre de la cuenta o meta')}</Text>
                <TextInput
                  style={[styles.modalInput, { backgroundColor: theme.surfaceMuted, borderColor: theme.border, color: theme.text }]}
                  placeholder="Ej. Mi próximo celular, Fondo Transporte..."
                  placeholderTextColor="#94A3B8"
                  value={newPocketName}
                  onChangeText={setNewPocketName}
                  returnKeyType="next"
                  maxLength={30}
                />

                {/* Meta fija */}
                <Text style={styles.modalInputLabel}>{t('Meta fija en pesos (RD$)')}</Text>
                <View style={[styles.amountInputContainer, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]}>
                  <Text style={styles.amountPrefix}>RD$</Text>
                  <TextInput
                    style={[styles.amountField, { color: theme.text }]}
                    placeholder="0.00"
                    placeholderTextColor="#94A3B8"
                    keyboardType="decimal-pad"
                    value={newPocketTarget}
                    onChangeText={setNewPocketTarget}
                    returnKeyType="done"
                    onSubmitEditing={handleCreatePocket}
                  />
                </View>

                <Pressable
                  style={[styles.modalSubmitBtn, { backgroundColor: accentColor }, isCreating && styles.disabledButton]}
                  onPress={handleCreatePocket}
                  disabled={isCreating}
                >
                  <Text style={styles.modalSubmitBtnText}>{isCreating ? 'Guardando...' : t('Crear Bolsillo')}</Text>
                </Pressable>
              </View>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* MODAL: Abonar o Retirar Dinero */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={actionModalVisible}
        onRequestClose={() => setActionModalVisible(false)}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalBackdrop}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={styles.modalKeyboardBox}
            >
              <View style={[styles.modalSheet, { backgroundColor: theme.surface }]}>
                <View style={[styles.modalHandle, { backgroundColor: theme.border }]} />

                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>
                    {actionType === 'abonar' ? 'Abonar a ' : 'Retirar de '}
                    {selectedPocket?.name}
                  </Text>
                  <Pressable onPress={() => setActionModalVisible(false)} style={[styles.modalCloseBtn, { backgroundColor: theme.surfaceMuted }]}>
                    <Text style={styles.modalCloseText}>✕</Text>
                  </Pressable>
                </View>

                <View style={[styles.modalAccountInfoRow, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]}>
                  <Text style={[styles.modalSubtitle, { color: theme.text }]}>
                    {actionType === 'abonar'
                      ? `Saldo disponible en cuenta: ${formatCurrency(mainBalance)}`
                      : `Disponible en bolsillo: ${formatCurrency(selectedPocket?.currentAmount || 0)}`}
                  </Text>
                  {actionType === 'abonar' && (
                    <Text style={[styles.modalSubtitleSub, { color: theme.textSecondary }]}>
                      Ahorrado actualmente: {formatCurrency(selectedPocket?.currentAmount || 0)} / {formatCurrency(selectedPocket?.targetAmount || 0)}
                    </Text>
                  )}
                </View>

                <View style={[styles.amountInputContainer, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]}>
                  <Text style={styles.amountPrefix}>RD$</Text>
                  <TextInput
                    style={[styles.amountField, { color: theme.text }]}
                    placeholder="0.00"
                    placeholderTextColor="#94A3B8"
                    keyboardType="decimal-pad"
                    value={actionAmount}
                    onChangeText={setActionAmount}
                    autoFocus={true}
                    returnKeyType="done"
                    onSubmitEditing={handleConfirmAction}
                  />
                </View>

                {/* Incrementos rápidos para abonar */}
                {actionType === 'abonar' && (
                  <View style={styles.quickRow}>
                    {QUICK_AMOUNTS.map((val) => (
                      <Pressable
                        key={val}
                        style={[styles.quickChip, { backgroundColor: `${accentColor}18`, borderColor: `${accentColor}55` }]}
                        onPress={() => {
                          const curr = parseFloat(actionAmount.replace(',', '.')) || 0;
                          setActionAmount((curr + val).toString());
                        }}
                      >
                        <Text style={styles.quickChipText}>+{val.toLocaleString()}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}

                <Pressable
                  style={[
                    styles.modalSubmitBtn,
                    actionType === 'retirar' && { backgroundColor: '#EF4444' },
                    isProcessingAction && styles.disabledButton,
                  ]}
                  onPress={handleConfirmAction}
                  disabled={isProcessingAction}
                >
                  <Text style={styles.modalSubmitBtnText}>
                    {isProcessingAction ? 'Procesando...' : `Confirmar ${actionType === 'abonar' ? 'Abono' : 'Retiro'}`}
                  </Text>
                </Pressable>
              </View>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screenWrapper: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  summaryCard: {
    backgroundColor: '#0F172A',
    borderRadius: 22,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 6,
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  summaryBadgeTitle: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  summaryMainAmount: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  countBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  countBadgeText: {
    color: '#818CF8',
    fontSize: 12,
    fontWeight: '700',
  },
  summaryProgressSection: {
    marginBottom: 16,
  },
  summaryProgressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  summaryTargetText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '600',
  },
  summaryPercentText: {
    color: '#34D399',
    fontSize: 12,
    fontWeight: '800',
  },
  summaryBarBg: {
    height: 7,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  summaryBarFill: {
    height: 7,
    backgroundColor: '#34D399',
    borderRadius: 4,
  },
  newPocketPrimaryBtn: {
    backgroundColor: '#4F46E5',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  newPocketPrimaryBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  sectionHeader: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  emptyContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 26,
    alignItems: 'center',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  emptyCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyIcon: {
    fontSize: 32,
  },
  emptyHeading: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
  },
  emptySubheading: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  emptyCreateBtn: {
    backgroundColor: '#4F46E5',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  emptyCreateBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  pocketsList: {
    gap: 14,
  },
  pocketCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  pocketTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  pocketTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  pocketEmojiBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  pocketEmojiText: {
    fontSize: 20,
  },
  pocketTitleTextCol: {
    flex: 1,
  },
  pocketName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  pocketTargetText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 1,
  },
  badgeCompleted: {
    backgroundColor: '#ECFDF5',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  badgeCompletedText: {
    color: '#059669',
    fontSize: 11,
    fontWeight: '700',
  },
  badgeAlmost: {
    backgroundColor: '#FEF3C7',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  badgeAlmostText: {
    color: '#D97706',
    fontSize: 11,
    fontWeight: '700',
  },
  badgeProgress: {
    backgroundColor: '#EEF2FF',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  badgeProgressText: {
    color: '#4F46E5',
    fontSize: 11,
    fontWeight: '700',
  },
  pocketAmountsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: 8,
    gap: 8,
  },
  pocketAmountLabel: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  pocketCurrentAmount: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
  },
  pocketRemainingCol: {
    alignItems: 'flex-end',
    flexShrink: 1,
  },
  pocketRemainingLabel: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  pocketRemaining: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  pocketBarBg: {
    height: 8,
    backgroundColor: '#F1F5F9',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 14,
  },
  pocketBarFill: {
    height: 8,
    borderRadius: 4,
  },
  pocketActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  actionAbonarBtn: {
    flex: 1,
    backgroundColor: '#EEF2FF',
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  actionAbonarText: {
    color: '#4F46E5',
    fontSize: 12,
    fontWeight: '700',
  },
  actionRetirarBtn: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  actionRetirarText: {
    color: '#475569',
    fontSize: 12,
    fontWeight: '700',
  },
  actionDeleteBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
  },
  actionDeleteText: {
    fontSize: 14,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  modalKeyboardBox: {
    width: '100%',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
  },
  modalHandle: {
    width: 44,
    height: 5,
    backgroundColor: '#E2E8F0',
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 14,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalAccountInfoRow: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalSubtitleSub: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseText: {
    fontSize: 14,
    color: '#475569',
    fontWeight: '700',
  },
  modalInputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  emojiScroll: {
    marginBottom: 16,
  },
  emojiChip: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  emojiChipActive: {
    borderColor: '#4F46E5',
    backgroundColor: '#EEF2FF',
  },
  emojiChipText: {
    fontSize: 22,
  },
  modalInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: '#0F172A',
    marginBottom: 16,
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 16,
  },
  amountPrefix: {
    fontSize: 18,
    fontWeight: '800',
    color: '#4F46E5',
    marginRight: 8,
  },
  amountField: {
    flex: 1,
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
    padding: 0,
  },
  quickRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 18,
  },
  quickChip: {
    flex: 1,
    backgroundColor: '#EEF2FF',
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  quickChipText: {
    color: '#4F46E5',
    fontSize: 12,
    fontWeight: '700',
  },
  modalSubmitBtn: {
    backgroundColor: '#4F46E5',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.6,
  },
  modalSubmitBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
