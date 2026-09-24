import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Alert,
} from 'react-native';
import { useTransactionStore } from '../store/useTransactionStore';
import { CATEGORY_LABELS, TransactionType } from '../types/transaction';
import { formatCurrency, formatDate } from '../utils/calculations';
import TransactionModal from '../components/TransactionModal';

type FilterType = 'todos' | 'gasto' | 'ingreso';

export default function TransactionsScreen() {
  const { transactions, deleteTransaction, clearAllTransactions } =
    useTransactionStore();

  const [modalVisible, setModalVisible] = useState(false);
  const [modalType, setModalType] = useState<TransactionType>('gasto');
  const [filter, setFilter] = useState<FilterType>('todos');

  const handleOpenModal = (type: TransactionType = 'gasto') => {
    setModalType(type);
    setModalVisible(true);
  };

  const handleConfirmDelete = (id: string, note?: string) => {
    Alert.alert(
      'Eliminar transacción',
      `¿Deseas eliminar este registro${note ? ` ("${note}")` : ''}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => deleteTransaction(id),
        },
      ]
    );
  };

  const handleConfirmClear = () => {
    Alert.alert(
      'Restablecer historial',
      '¿Estás seguro de que deseas eliminar todas las transacciones?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar todo',
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
    return t.type === 'ingreso' ? acc + t.amount : acc - t.amount;
  }, 0);

  return (
    <View style={styles.container}>
      {/* Barra superior de acciones */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.topTitle}>Historial Smart</Text>
          <Text style={styles.topSubtitle}>
            {filteredTransactions.length}{' '}
            {filteredTransactions.length === 1 ? 'movimiento' : 'movimientos'}
          </Text>
        </View>

        <View style={styles.topActions}>
          {transactions.length > 0 && (
            <Pressable
              style={styles.clearButton}
              onPress={handleConfirmClear}
            >
              <Text style={styles.clearButtonText}>🗑️</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Selector de Filtros */}
      <View style={styles.filterRow}>
        <Pressable
          style={[styles.filterChip, filter === 'todos' && styles.filterChipActive]}
          onPress={() => setFilter('todos')}
        >
          <Text
            style={[
              styles.filterChipText,
              filter === 'todos' && styles.filterChipTextActive,
            ]}
          >
            Todos ({transactions.length})
          </Text>
        </Pressable>

        <Pressable
          style={[styles.filterChip, filter === 'gasto' && styles.filterChipActive]}
          onPress={() => setFilter('gasto')}
        >
          <Text
            style={[
              styles.filterChipText,
              filter === 'gasto' && styles.filterChipTextActive,
            ]}
          >
            📉 Gastos
          </Text>
        </Pressable>

        <Pressable
          style={[styles.filterChip, filter === 'ingreso' && styles.filterChipActive]}
          onPress={() => setFilter('ingreso')}
        >
          <Text
            style={[
              styles.filterChipText,
              filter === 'ingreso' && styles.filterChipTextActive,
            ]}
          >
            📈 Ingresos
          </Text>
        </Pressable>
      </View>

      {/* Lista de Transacciones o Empty State */}
      <FlatList
        data={filteredTransactions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyCard}>
            <View style={styles.emptyIconCircle}>
              <Text style={styles.emptyIcon}>💳</Text>
            </View>
            <Text style={styles.emptyTitle}>Sin movimientos aún</Text>
            <Text style={styles.emptyDescription}>
              Comienza a llevar el control financiero de tu Smart Bank registrando tus
              ingresos y gastos diarios.
            </Text>

            <Pressable
              style={styles.emptyPrimaryBtn}
              onPress={() => handleOpenModal('gasto')}
            >
              <Text style={styles.emptyPrimaryBtnText}>➕ Registrar movimiento</Text>
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
            <View style={styles.transactionCard}>
              <View style={styles.cardLeft}>
                <View
                  style={[
                    styles.categoryAvatar,
                    isIncome ? styles.avatarIncome : styles.avatarExpense,
                  ]}
                >
                  <Text style={styles.categoryEmoji}>{catInfo.emoji}</Text>
                </View>

                <View style={styles.cardInfo}>
                  <Text style={styles.categoryLabel}>{catInfo.label}</Text>
                  {item.note ? (
                    <Text style={styles.transactionNote} numberOfLines={1}>
                      {item.note}
                    </Text>
                  ) : null}
                  <Text style={styles.dateLabel}>{formatDate(item.date)}</Text>
                </View>
              </View>

              <View style={styles.cardRight}>
                <Text style={isIncome ? styles.amountIncome : styles.amountExpense}>
                  {isIncome ? '+' : '-'} {formatCurrency(item.amount)}
                </Text>
                <Pressable
                  style={styles.deleteAction}
                  hitSlop={8}
                  onPress={() => handleConfirmDelete(item.id, item.note)}
                >
                  <Text style={styles.deleteActionText}>Eliminar</Text>
                </Pressable>
              </View>
            </View>
          );
        }}
      />

      {/* Botón Flotante de Acción Rápida (FAB) */}
      <Pressable
        style={({ pressed }) => [styles.fabButton, pressed && styles.fabPressed]}
        onPress={() => handleOpenModal('gasto')}
      >
        <Text style={styles.fabIcon}>＋</Text>
      </Pressable>

      {/* Modal Inteligente de Transacciones */}
      <TransactionModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        initialType={modalType}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  topTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.5,
  },
  topSubtitle: {
    fontSize: 13,
    color: '#64748B',
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
    marginBottom: 14,
  },
  filterChip: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#E2E8F0',
  },
  filterChipActive: {
    backgroundColor: '#0F172A',
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
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
    backgroundColor: '#FFFFFF',
    padding: 14,
    borderRadius: 16,
    marginBottom: 10,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1.5,
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
  },
  amountIncome: {
    fontSize: 15,
    fontWeight: '800',
    color: '#10B981',
  },
  amountExpense: {
    fontSize: 15,
    fontWeight: '800',
    color: '#EF4444',
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
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginTop: 20,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EEF2FF',
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
    backgroundColor: '#4F46E5',
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  emptyPrimaryBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
  emptySecondaryBtn: {
    width: '100%',
    backgroundColor: '#F1F5F9',
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
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#4F46E5',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
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
