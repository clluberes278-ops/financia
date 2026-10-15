import React, { useState, useMemo } from 'react';
import {
  View,
  Text as NativeText,
  StyleSheet,
  FlatList,
  Pressable,
  Alert,
} from 'react-native';
import { BottomSheetModal } from '@gorhom/bottom-sheet';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTransactionStore } from '../store/useTransactionStore';
import { CATEGORY_LABELS, TransactionType } from '../types/transaction';
import { formatCurrency, formatDate } from '../utils/calculations';
import TransactionBottomSheet from '../components/TransactionBottomSheet';
import { useSettingsStore } from '../store/useSettingsStore';
import { useTranslation } from '../utils/translations';
import { getShadowStyle, getThemeColors, ThemedText } from '../utils/theme';

type FilterType = 'todos' | 'gasto' | 'ingreso';
const Text = ThemedText;

export default function TransactionsScreen() {
  const { transactions, deleteTransaction, clearAllTransactions } =
    useTransactionStore();
  const accentColor = useSettingsStore((state) => state.accentColor);
  const appTheme = useSettingsStore((state) => state.theme);
  const cardColor = useSettingsStore((state) => state.cardColor);
  const theme = getThemeColors(appTheme, cardColor);
  const { t } = useTranslation();

  const bottomSheetRef = React.useRef<BottomSheetModal>(null);
  const [modalType, setModalType] = useState<TransactionType>('gasto');
  const [filter, setFilter] = useState<FilterType>('todos');

  const handleOpenModal = (type: TransactionType = 'gasto') => {
    setModalType(type);
    bottomSheetRef.current?.present();
  };

  const handleConfirmDelete = (id: string, note?: string) => {
    Alert.alert(
      t('Eliminar transacción'),
      `${t('¿Deseas eliminar este registro')}${note ? ` ("${note}")` : ''}?`,
      [
        { text: t('Cancelar'), style: 'cancel' },
        {
          text: t('Eliminar'),
          style: 'destructive',
          onPress: () => deleteTransaction(id),
        },
      ]
    );
  };

  const handleConfirmClear = () => {
    Alert.alert(
      t('Restablecer historial'),
      t('¿Estás seguro de que deseas eliminar todas las transacciones?'),
      [
        { text: t('Cancelar'), style: 'cancel' },
        {
          text: t('Borrar todo'),
          style: 'destructive',
          onPress: () => clearAllTransactions(),
        },
      ]
    );
  };

  const filteredTransactions = transactions
    .filter((t) => {
      if (filter === 'todos') return true;
      return t.type === filter;
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const totalFilteredAmount = filteredTransactions.reduce((acc, t) => {
    if (filter !== 'todos') return acc + t.amount;
    return t.type === 'ingreso' ? acc + t.amount : acc - t.amount;
  }, 0);
  const totalLabel = filter === 'todos'
    ? t('Balance neto')
    : filter === 'gasto'
      ? t('Total de gastos')
      : t('Total de ingresos');

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Barra superior de acciones */}
      <View style={styles.topBar}>
        <View>
          <Text style={[styles.topTitle, { color: theme.text }]}>{t('Historial Smart')}</Text>
          <Text style={[styles.topSubtitle, { color: theme.textSecondary }]}>
            {filteredTransactions.length}{' '}
            {filteredTransactions.length === 1 ? t('movimiento') : t('movimientos')}
          </Text>
        </View>

        <View style={styles.topActions}>
          {transactions.length > 0 && (
            <Pressable
              style={[styles.clearButton, { backgroundColor: theme.surfaceMuted }]}
              onPress={handleConfirmClear}
            >
              <MaterialCommunityIcons name="trash-can-outline" size={18} color={theme.textSecondary} />
            </Pressable>
          )}
        </View>
      </View>

      <LinearGradient
        colors={[theme.heroStart, theme.heroEnd]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0.8 }}
        style={styles.totalCard}
      >
        <View style={styles.totalCopy}>
          <Text style={styles.totalLabel}>{totalLabel}</Text>
          <Text style={styles.totalAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.55}>
            {formatCurrency(totalFilteredAmount)}
          </Text>
        </View>
        <View style={styles.totalIcon}>
          <MaterialCommunityIcons name="swap-vertical" size={22} color="#FFFFFF" />
        </View>
      </LinearGradient>

      {/* Selector de Filtros */}
      <View style={styles.filterRow}>
        <Pressable
          style={[styles.filterChip, { backgroundColor: theme.surfaceMuted }, filter === 'todos' && { backgroundColor: accentColor }]}
          onPress={() => setFilter('todos')}
        >
          <Text
            style={[
              styles.filterChipText,
              { color: theme.textSecondary },
              filter === 'todos' && styles.filterChipTextActive,
            ]}
          >
            {t('Todos')} ({transactions.length})
          </Text>
        </Pressable>

        <Pressable
          style={[styles.filterChip, { backgroundColor: theme.surfaceMuted }, filter === 'gasto' && { backgroundColor: accentColor }]}
          onPress={() => setFilter('gasto')}
        >
          <View style={styles.filterChipContent}>
            <MaterialCommunityIcons name="trending-down" size={14} color={filter === 'gasto' ? '#FFFFFF' : theme.textSecondary} />
            <Text
              style={[
                styles.filterChipText,
                { color: theme.textSecondary },
                filter === 'gasto' && styles.filterChipTextActive,
              ]}
            >
              {t('Gastos')}
            </Text>
          </View>
        </Pressable>

        <Pressable
          style={[styles.filterChip, { backgroundColor: theme.surfaceMuted }, filter === 'ingreso' && { backgroundColor: accentColor }]}
          onPress={() => setFilter('ingreso')}
        >
          <View style={styles.filterChipContent}>
            <MaterialCommunityIcons name="trending-up" size={14} color={filter === 'ingreso' ? '#FFFFFF' : theme.textSecondary} />
            <Text
              style={[
                styles.filterChipText,
                { color: theme.textSecondary },
                filter === 'ingreso' && styles.filterChipTextActive,
              ]}
            >
              {t('Ingresos')}
            </Text>
          </View>
        </Pressable>
      </View>

      {/* Lista de Transacciones o Empty State */}
      <FlatList
        data={filteredTransactions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={[styles.emptyIconCircle, { backgroundColor: `${accentColor}18` }]}>
              <MaterialCommunityIcons name="credit-card-outline" size={32} color={accentColor} />
            </View>
            <Text style={styles.emptyTitle}>{t('Sin movimientos aún')}</Text>
            <Text style={styles.emptyDescription}>
              Comienza a llevar el control financiero de tu Smart Bank registrando tus
              ingresos y gastos diarios.
            </Text>

            <Pressable
              style={[styles.emptyPrimaryBtn, { backgroundColor: accentColor }]}
              onPress={() => handleOpenModal('gasto')}
            >
              <View style={styles.emptyBtnContent}>
                <MaterialCommunityIcons name="plus" size={20} color="#FFFFFF" />
                <Text style={styles.emptyPrimaryBtnText}>{t('Registrar movimiento')}</Text>
              </View>
            </Pressable>
          </View>
        }
        renderItem={({ item }) => {
          const isIncome = item.type === 'ingreso';
          const catInfo = CATEGORY_LABELS[item.category] || {
            label: item.category,
            emoji: '🏷️',
          };

          return (
            <View style={[
              styles.transactionCard,
              {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                borderLeftColor: isIncome ? theme.income : theme.expense,
              },
            ]}>
              <View style={styles.cardLeft}>
                <View
                  style={[
                    styles.categoryAvatar,
                    {
                      backgroundColor: isIncome ? `${theme.income}20` : `${theme.expense}20`,
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={catInfo.emoji === '💰' ? 'cash' : 'tag-outline'}
                    size={22}
                    color={isIncome ? theme.income : theme.expense}
                  />
                </View>

                <View style={styles.cardInfo}>
                  <Text style={styles.categoryLabel}>{t(catInfo.label)}</Text>
                  {item.note ? (
                    <Text style={styles.transactionNote} numberOfLines={1}>
                      {item.note}
                    </Text>
                  ) : null}
                  <Text style={styles.dateLabel}>{formatDate(item.date)}</Text>
                </View>
              </View>

              <View style={styles.cardRight}>
                <Text style={[isIncome ? styles.amountIncome : styles.amountExpense, { color: isIncome ? theme.income : theme.expense }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.55}>
                  {isIncome ? '+' : '-'} {formatCurrency(item.amount)}
                </Text>
                <Pressable
                  style={styles.deleteAction}
                  hitSlop={8}
                  onPress={() => handleConfirmDelete(item.id, item.note)}
                >
                  <Text style={styles.deleteActionText}>{t('Eliminar')}</Text>
                </Pressable>
              </View>
            </View>
          );
        }}
      />

      {/* Botón Flotante de Acción Rápida (FAB) */}
      <Pressable
        style={({ pressed }) => [styles.fabButton, getShadowStyle({ color: accentColor, offsetX: 0, offsetY: 6, opacity: 0.3, radius: 14, elevation: 8 }), pressed && styles.fabPressed]}
        onPress={() => handleOpenModal('gasto')}
      >
        <LinearGradient colors={[accentColor, theme.heroEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.fabGradient}>
          <MaterialCommunityIcons name="plus" size={28} color="#FFFFFF" />
        </LinearGradient>
      </Pressable>

      <TransactionBottomSheet
        bottomSheetRef={bottomSheetRef}
        initialType={modalType}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 16,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  topTitle: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  topSubtitle: {
    fontSize: 13,
    fontWeight: '500',
    marginTop: 1,
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  clearButton: {
    backgroundColor: '#F1F5F9',
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearButtonText: {
    fontSize: 14,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 18,
  },
  totalCard: {
    minHeight: 104,
    borderRadius: 24,
    padding: 18,
    marginBottom: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...getShadowStyle({ color: '#8B5CF6', offsetX: 0, offsetY: 8, opacity: 0.2, radius: 14, elevation: 5 }),
  },
  totalCopy: {
    flex: 1,
    marginRight: 12,
  },
  totalLabel: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 5,
  },
  totalAmount: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  totalIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterChip: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 14,
  },
  filterChipContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  filterChipActive: {
    backgroundColor: '#0F172A',
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  listContent: {
    paddingBottom: 90,
  },
  transactionCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderRadius: 20,
    borderLeftWidth: 3,
    marginBottom: 10,
    ...getShadowStyle({ color: '#0F172A', offsetX: 0, offsetY: 2, opacity: 0.04, radius: 6, elevation: 1.5 }),
  },
  cardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  categoryAvatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarIncome: {
    backgroundColor: '#ECFDF5',
  },
  avatarExpense: {
    backgroundColor: '#FEF2F2',
  },
  categoryEmoji: {
    fontSize: 22,
  },
  cardInfo: {
    flex: 1,
  },
  categoryLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 2,
  },
  transactionNote: {
    fontSize: 13,
    color: '#64748B',
    marginBottom: 2,
  },
  dateLabel: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  cardRight: {
    alignItems: 'flex-end',
    maxWidth: '48%',
    flexShrink: 1,
  },
  amountIncome: {
    fontSize: 15,
    fontWeight: '800',
    color: '#10B981',
    maxWidth: '100%',
  },
  amountExpense: {
    fontSize: 15,
    fontWeight: '800',
    color: '#EF4444',
    maxWidth: '100%',
  },
  deleteAction: {
    marginTop: 4,
  },
  deleteActionText: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  emptyCard: {
    borderRadius: 26,
    padding: 24,
    alignItems: 'center',
    marginTop: 20,
    ...getShadowStyle({ color: '#0F172A', offsetX: 0, offsetY: 4, opacity: 0.05, radius: 10, elevation: 2 }),
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F3E8FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyIcon: {
    fontSize: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: 20,
  },
  emptyPrimaryBtn: {
    width: '100%',
    paddingVertical: 13,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 10,
  },
  emptyBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  emptyPrimaryBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  emptySecondaryBtn: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  emptySecondaryBtnText: {
    color: '#0F172A',
    fontWeight: '700',
    fontSize: 14,
  },
  fabButton: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 22,
    overflow: 'hidden',
  },
  fabGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabPressed: {
    transform: [{ scale: 0.94 }],
    opacity: 0.9,
  },
  fabIcon: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '600',
    marginTop: -2,
  },
});
