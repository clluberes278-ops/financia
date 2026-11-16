import { parseMoney } from '../utils/money';
import CurrencySelector from '../components/CurrencySelector';
import { useCurrencyStore } from '../store/useCurrencyStore';
import React, { useState } from 'react';
import {
  View,
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
import { getShadowStyle, getThemeColors, ThemedText } from '../utils/theme';
import GradientView from '../components/GradientView';

const POPULAR_EMOJIS = ['📱', '🚗', '🛡️', '🏖️', '💻', '🏠', '🎓', '🎁', '🎮', '🐖'];
const QUICK_AMOUNTS = [500, 1000, 2000, 5000];
const Text = ThemedText;

export default function SavingsScreen() {
  const { pockets: allPockets, createPocket, depositToPocket, withdrawFromPocket, deletePocket } =
    useSavingsStore();
  const allTransactions = useTransactionStore(s => s.transactions);
  const accentColor = useSettingsStore((state) => state.accentColor);
  const appTheme = useSettingsStore((state) => state.theme);
  const cardColor = useSettingsStore((state) => state.cardColor);
  const theme = getThemeColors(appTheme, cardColor);
  const currency = useCurrencyStore(s => s.currency);
  const { t } = useTranslation();
  const transactions = allTransactions.filter(t => t.currency === currency);
  const pockets = allPockets.filter(p => p.currency === currency);

  const mainBalance = calculateBalance(transactions);

  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newPocketName, setNewPocketName] = useState('');
  const [newPocketTarget, setNewPocketTarget] = useState('');
  const [selectedEmoji, setSelectedEmoji] = useState('📱');

  const [actionModalVisible, setActionModalVisible] = useState(false);
  const [selectedPocket, setSelectedPocket] = useState<SavingsPocket | null>(null);
  const [actionType, setActionType] = useState<'abonar' | 'retirar'>('abonar');
  const [actionAmount, setActionAmount] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isProcessingAction, setIsProcessingAction] = useState(false);


  const totalSaved = pockets.reduce((acc, p) => acc + p.currentAmount, 0);
  const totalTarget = pockets.reduce((acc, p) => acc + p.targetAmount, 0);
  const globalProgress = totalTarget > 0 ? Math.min(100, Math.round((totalSaved / totalTarget) * 100)) : 0;

  const handleCreatePocket = async () => {
    const target = parseMoney(newPocketTarget);
    if (!newPocketName.trim()) {
      Alert.alert('Falta información', 'Por favor ingresa un nombre para la meta o bolsillo.');
      return;
    }
    if (!Number.isFinite(target) || target <= 0) {
      Alert.alert('Monto inválido', 'Por favor ingresa una meta fija válida.');
      return;
    }

    setIsCreating(true);
    try {
      await createPocket({
        name: newPocketName.trim(),
        targetAmount: target,
        currency,
        emoji: selectedEmoji,
      });
      Keyboard.dismiss();
      setNewPocketName('');
      setNewPocketTarget('');
      setSelectedEmoji('📱');
      setCreateModalVisible(false);
    } catch (error: unknown) {
      Alert.alert(t('Error'), error instanceof Error ? error.message : t('No se pudo crear el bolsillo. Inténtalo de nuevo.'));
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
    const amount = parseMoney(actionAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert('Monto inválido', 'Ingresa un monto válido.');
      return;
    }

    setIsProcessingAction(true);
    try {
      if (actionType === 'abonar') {
        if (amount > mainBalance) {
          Alert.alert('Saldo insuficiente', `No tienes suficiente saldo disponible (${formatCurrency(mainBalance, currency)}).`);
          return;
        }
        await depositToPocket(selectedPocket.id, amount);

      } else {
        if (amount > selectedPocket.currentAmount) {
          Alert.alert('Monto excesivo', `Solo tienes ${formatCurrency(selectedPocket.currentAmount, currency)}.`);
          return;
        }
        await withdrawFromPocket(selectedPocket.id, amount);

      }
      Keyboard.dismiss();
      setActionModalVisible(false);
      setActionAmount('');
    } catch (error: unknown) {
      Alert.alert(t('Error'), error instanceof Error ? error.message : t('No se pudo completar la operación. Inténtalo de nuevo.'));
    } finally {
      setIsProcessingAction(false);
    }
  };

  const handleDeletePocket = (pocket: SavingsPocket) => {
    Alert.alert(
      'Eliminar Bolsillo',
      pocket.currentAmount > 0
        ? `El bolsillo "${pocket.name}" tiene ${formatCurrency(pocket.currentAmount, currency)}. ¿Deseas devolverlo a la cuenta principal?`
        : `¿Deseas eliminar el bolsillo "${pocket.name}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              await deletePocket(pocket.id);
            } catch (error: unknown) {
              Alert.alert(t('Error'), error instanceof Error ? error.message : t('No se pudo completar la operación. Inténtalo de nuevo.'));
            }
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
        <CurrencySelector />
        <GradientView
          colors={[theme.heroStart, theme.heroEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0.9 }}
          style={styles.summaryCard}
        >
          <View style={styles.summaryHeader}>
            <View>
              <Text style={styles.summaryBadgeTitle}>{t('BOLSAS & METAS DE AHORRO')}</Text>
              <Text style={styles.summaryMainAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>{formatCurrency(totalSaved, currency)}</Text>
            </View>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{pockets.length} {pockets.length === 1 ? t('meta') : t('metas')}</Text>
            </View>
          </View>

          {totalTarget > 0 && (
            <View style={styles.summaryProgressSection}>
              <View style={styles.summaryProgressLabels}>
                <Text style={styles.summaryTargetText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>{t('Objetivo global')}: {formatCurrency(totalTarget, currency)}</Text>
                <Text style={styles.summaryPercentText}>{globalProgress}%</Text>
              </View>
              <View style={styles.summaryBarBg}>
                <GradientView colors={['#FDE68A', '#FFFFFF']} style={[styles.summaryBarFill, { width: `${globalProgress}%` }]} />
              </View>
            </View>
          )}

          <Pressable
            style={styles.newPocketPrimaryBtn}
            onPress={() => setCreateModalVisible(true)}
          >
            <Text style={styles.newPocketPrimaryBtnText}>＋ {t('Crear Nuevo Bolsillo de Ahorro')}</Text>
          </Pressable>
        </GradientView>

        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('Tus Cuentas de Ahorro')}</Text>
        </View>

        {pockets.length === 0 ? (
          <View style={[styles.emptyContainer, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={[styles.emptyCircle, { backgroundColor: `${accentColor}15` }]}>
              <Text style={styles.emptyIcon}>🎯</Text>
            </View>
            <Text style={[styles.emptyHeading, { color: theme.text }]}>{t('Separa tu dinero con metas fijas')}</Text>
            <Text style={[styles.emptySubheading, { color: theme.textSecondary }]}>
              Crea bolsillos específicos para no mezclar tu dinero.
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
                  <View style={styles.pocketTopRow}>
                    <View style={styles.pocketTitleGroup}>
                      <View style={[styles.pocketEmojiBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
                        <Text style={styles.pocketEmojiText}>{pocket.emoji}</Text>
                      </View>
                      <View style={styles.pocketTitleTextCol}>
                        <Text style={[styles.pocketName, { color: theme.text }]} numberOfLines={1}>
                          {pocket.name}
                        </Text>
                        <Text style={[styles.pocketTargetText, { color: theme.textSecondary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}>
                          Meta: {formatCurrency(pocket.targetAmount, currency)}
                        </Text>
                      </View>
                    </View>

                    {isCompleted ? (
                      <View style={styles.badgeCompleted}><Text style={[styles.badgeCompletedText, { color: theme.income }]}>🏆 100%</Text></View>
                    ) : isAlmostDone ? (
                      <View style={styles.badgeAlmost}><Text style={[styles.badgeAlmostText, { color: theme.warning }]}>🔔 {progress}%</Text></View>
                    ) : (
                      <View style={styles.badgeProgress}><Text style={[styles.badgeProgressText, { color: accentColor }]}>{progress}%</Text></View>
                    )}
                  </View>

                  <View style={styles.pocketAmountsRow}>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={[styles.pocketAmountLabel, { color: theme.textSecondary }]}>{t('Ahorrado')}</Text>
                      <Text style={[styles.pocketCurrentAmount, { color: theme.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                        {formatCurrency(pocket.currentAmount, currency)}
                      </Text>
                    </View>
                    <View style={styles.pocketRemainingCol}>
                      <Text style={[styles.pocketRemainingLabel, { color: theme.textSecondary }]}>{t('Estado')}</Text>
                      <Text style={[styles.pocketRemaining, { color: theme.textSecondary }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.55}>
                        {isCompleted ? t('Completado') : `${t('Falta')} ${formatCurrency(pocket.targetAmount - pocket.currentAmount, currency)}`}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.pocketBarBg}>
                    <View style={[styles.pocketBarFill, { width: `${progress}%`, backgroundColor: isCompleted ? theme.income : isAlmostDone ? theme.warning : accentColor }]} />
                  </View>

                  <View style={styles.pocketActionsRow}>
                    <Pressable
                      style={[styles.actionAbonarBtn, { borderColor: accentColor, backgroundColor: `${accentColor}10` }]}
                      onPress={() => handleOpenActionModal(pocket, 'abonar')}
                    >
                      <Text style={[styles.actionAbonarText, { color: accentColor }]}>＋ {t('Abonar')}</Text>
                    </Pressable>

                    <Pressable
                      style={[styles.actionRetirarBtn, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]}
                      onPress={() => handleOpenActionModal(pocket, 'retirar')}
                    >
                      <Text style={[styles.actionRetirarText, { color: theme.textSecondary }]}>− {t('Retirar')}</Text>
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
      <Modal animationType="slide" transparent={true} visible={createModalVisible} onRequestClose={() => setCreateModalVisible(false)}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalBackdrop}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalKeyboardBox}>
              <View style={[styles.modalSheet, { backgroundColor: theme.surface }]}>
                <View style={[styles.modalHandle, { backgroundColor: theme.border }]} />
                <View style={styles.modalHeader}>
                  <Text style={[styles.modalTitle, { color: theme.text }]}>{t('Nuevo Bolsillo de Ahorro')}</Text>
                  <Pressable onPress={() => setCreateModalVisible(false)} style={[styles.modalCloseBtn, { backgroundColor: theme.surfaceMuted }]}>
                    <Text style={[styles.modalCloseText, { color: theme.textSecondary }]}>✕</Text>
                  </Pressable>
                </View>

                <Text style={[styles.modalInputLabel, { color: theme.textSecondary }]}>{t('Ícono representativo')}</Text>
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

                <Text style={[styles.modalInputLabel, { color: theme.textSecondary }]}>{t('Nombre de la cuenta o meta')}</Text>
                <TextInput
                  style={[styles.modalInput, { backgroundColor: theme.surfaceMuted, borderColor: theme.border, color: theme.text }]}
                  placeholder="Ej. Mi próximo celular, Fondo Transporte..."
                  placeholderTextColor="#94A3B8"
                  value={newPocketName}
                  onChangeText={setNewPocketName}
                  returnKeyType="next"
                  maxLength={30}
                />

                <Text style={[styles.modalInputLabel, { color: theme.textSecondary }]}>{t('Meta fija')} ({currency})</Text>
                <View style={[styles.amountInputContainer, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]}>
                  <Text style={[styles.amountPrefix, { color: accentColor }]}>{currency}</Text>
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
      <Modal animationType="slide" transparent={true} visible={actionModalVisible} onRequestClose={() => setActionModalVisible(false)}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalBackdrop}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalKeyboardBox}>
              <View style={[styles.modalSheet, { backgroundColor: theme.surface }]}>
                <View style={[styles.modalHandle, { backgroundColor: theme.border }]} />
                <View style={styles.modalHeader}>
                  <Text style={[styles.modalTitle, { color: theme.text }]}>
                    {actionType === 'abonar' ? 'Abonar a ' : 'Retirar de '} {selectedPocket?.name}
                  </Text>
                  <Pressable onPress={() => setActionModalVisible(false)} style={[styles.modalCloseBtn, { backgroundColor: theme.surfaceMuted }]}>
                    <Text style={[styles.modalCloseText, { color: theme.textSecondary }]}>✕</Text>
                  </Pressable>
                </View>

                <View style={[styles.modalAccountInfoRow, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]}>
                  <Text style={[styles.modalSubtitle, { color: theme.text }]}>
                    {actionType === 'abonar'
                      ? `Saldo disponible en cuenta: ${formatCurrency(mainBalance, currency)}`
                      : `Disponible en bolsillo: ${formatCurrency(selectedPocket?.currentAmount || 0, currency)}`}
                  </Text>
                  {actionType === 'abonar' && (
                    <Text style={[styles.modalSubtitleSub, { color: theme.textSecondary }]}>
                      Ahorrado actualmente: {formatCurrency(selectedPocket?.currentAmount || 0, currency)} / {formatCurrency(selectedPocket?.targetAmount || 0, currency)}
                    </Text>
                  )}
                </View>

                <View style={[styles.amountInputContainer, { backgroundColor: theme.surfaceMuted, borderColor: theme.border }]}>
                  <Text style={[styles.amountPrefix, { color: accentColor }]}>{currency}</Text>
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

                {actionType === 'abonar' && (
                  <View style={styles.quickRow}>
                    {QUICK_AMOUNTS.map((val) => (
                      <Pressable
                        key={val}
                        style={[styles.quickChip, { backgroundColor: `${accentColor}18`, borderColor: `${accentColor}55` }]}
                        onPress={() => {
                          const curr = parseMoney(actionAmount) || 0;
                          setActionAmount((curr + val).toString());
                        }}
                      >
                        <Text style={[styles.quickChipText, { color: accentColor }]}>+{val.toLocaleString()}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}

                <Pressable
                  style={[
                    styles.modalSubmitBtn,
                    actionType === 'retirar' && { backgroundColor: theme.expense },
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
  screenWrapper: { flex: 1 },
  container: { flex: 1 },
  contentContainer: { padding: 16, paddingBottom: 40 },
  summaryCard: { borderRadius: 30, padding: 22, marginBottom: 24, ...getShadowStyle({ color: '#7C3AED', offsetX: 0, offsetY: 12, opacity: 0.22, radius: 20, elevation: 8 }) },
  summaryHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
  summaryBadgeTitle: { color: 'rgba(255,255,255,0.76)', fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginBottom: 4 },
  summaryMainAmount: { color: '#FFFFFF', fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
  countBadge: { backgroundColor: 'rgba(255,255,255,0.18)', paddingVertical: 6, paddingHorizontal: 11, borderRadius: 14 },
  countBadgeText: { color: '#FFFFFF', fontSize: 12, fontWeight: '700' },
  summaryProgressSection: { marginBottom: 16 },
  summaryProgressLabels: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  summaryTargetText: { color: 'rgba(255,255,255,0.78)', fontSize: 12, fontWeight: '600' },
  summaryPercentText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  summaryBarBg: { height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.2)' },
  summaryBarFill: { height: 8, borderRadius: 4 },
  newPocketPrimaryBtn: { backgroundColor: 'rgba(255,255,255,0.17)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', paddingVertical: 14, borderRadius: 17, alignItems: 'center' },
  newPocketPrimaryBtnText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  sectionHeader: { marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '800', letterSpacing: -0.3 },
  emptyContainer: { borderRadius: 24, padding: 26, alignItems: 'center', marginTop: 20, borderWidth: 1, ...getShadowStyle({ color: '#000000', offsetX: 0, offsetY: 4, opacity: 0.05, radius: 10, elevation: 2 }) },
  emptyCircle: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  emptyIcon: { fontSize: 32 },
  emptyHeading: { fontSize: 17, fontWeight: '800', marginBottom: 6 },
  emptySubheading: { fontSize: 13, textAlign: 'center', lineHeight: 18, marginBottom: 20 },
  emptyCreateBtn: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12 },
  emptyCreateBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  pocketsList: { gap: 14 },
  pocketCard: { borderRadius: 23, padding: 17, ...getShadowStyle({ color: '#32145A', offsetX: 0, offsetY: 5, opacity: 0.07, radius: 10, elevation: 3 }), borderWidth: 1 },
  pocketTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  pocketTitleGroup: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginRight: 8 },
  pocketEmojiBox: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  pocketEmojiText: { fontSize: 20 },
  pocketTitleTextCol: { flex: 1, minWidth: 0 },
  pocketName: { fontSize: 15, fontWeight: '800' },
  pocketTargetText: { fontSize: 11, fontWeight: '500', marginTop: 1 },
  badgeCompleted: { backgroundColor: 'rgba(16, 185, 129, 0.1)', paddingVertical: 3, paddingHorizontal: 8, borderRadius: 8 },
  badgeCompletedText: { color: '#059669', fontSize: 11, fontWeight: '700' },
  badgeAlmost: { backgroundColor: 'rgba(245, 158, 15, 0.1)', paddingVertical: 3, paddingHorizontal: 8, borderRadius: 8 },
  badgeAlmostText: { color: '#D97706', fontSize: 11, fontWeight: '700' },
  badgeProgress: { backgroundColor: 'rgba(79, 70, 229, 0.1)', paddingVertical: 3, paddingHorizontal: 8, borderRadius: 8 },
  badgeProgressText: { color: '#4F46E5', fontSize: 11, fontWeight: '700' },
  pocketAmountsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 8, gap: 8 },
  pocketAmountLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  pocketCurrentAmount: { fontSize: 18, fontWeight: '800' },
  pocketRemainingCol: { alignItems: 'flex-end', flexShrink: 1, flex: 1, minWidth: 0 },
  pocketRemainingLabel: { fontSize: 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  pocketRemaining: { fontSize: 12, fontWeight: '600' },
  pocketBarBg: { height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 14 },
  pocketBarFill: { height: 8, borderRadius: 4 },
  pocketActionsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)' },
  actionAbonarBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center', borderWidth: 1 },
  actionAbonarText: { fontSize: 12, fontWeight: '700' },
  actionRetirarBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: 'center', borderWidth: 1 },
  actionRetirarText: { fontSize: 12, fontWeight: '700' },
  actionDeleteBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  actionDeleteText: { fontSize: 14 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.65)', justifyContent: 'flex-end' },
  modalKeyboardBox: { width: '100%' },
  modalSheet: { borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 20, paddingTop: 12, paddingBottom: Platform.OS === 'ios' ? 36 : 24 },
  modalHandle: { width: 44, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 14 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 19, fontWeight: '800' },
  modalAccountInfoRow: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 16 },
  modalSubtitle: { fontSize: 13, fontWeight: '700' },
  modalSubtitleSub: { fontSize: 11, marginTop: 4 },
  modalCloseBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  modalCloseText: { fontSize: 14, fontWeight: '700' },
  modalInputLabel: { fontSize: 12, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase' },
  emojiScroll: { marginBottom: 16 },
  emojiChip: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 8, borderWidth: 1.5 },
  emojiChipActive: { backgroundColor: 'rgba(99, 102, 241, 0.1)' },
  emojiChipText: { fontSize: 22 },
  modalInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, marginBottom: 16 },
  amountInputContainer: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 10, marginBottom: 16 },
  amountPrefix: { fontSize: 18, fontWeight: '800', marginRight: 8 },
  amountField: { flex: 1, fontSize: 24, fontWeight: '800', padding: 0 },
  quickRow: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  quickChip: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center', borderWidth: 1 },
  quickChipText: { fontSize: 12, fontWeight: '700' },
  modalSubmitBtn: { paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  disabledButton: { opacity: 0.6 },
  modalSubmitBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
});
