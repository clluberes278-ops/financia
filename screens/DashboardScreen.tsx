import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  StatusBar,
  Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTransactionStore } from '../store/useTransactionStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { getThemeColors } from '../utils/theme';
import {
  calculateBalance,
  calculateTotalIncome,
  calculateTotalExpenses,
  getRecentTransactions,
  formatCurrency,
  formatDate,
} from '../utils/calculations';
import { CATEGORY_LABELS } from '../types/transaction';
import { useTranslation } from '../utils/translations';

const { width } = Dimensions.get('window');

export default function DashboardScreen() {
  const navigation = useNavigation<any>();
  const { transactions, loadTransactions } = useTransactionStore();
  const { t } = useTranslation();
  const appTheme = useSettingsStore((state) => state.theme);
  const accentColor = useSettingsStore((state) => state.accentColor);
  const theme = getThemeColors(appTheme);

  useEffect(() => {
    loadTransactions();
  }, []);

  const balance = calculateBalance(transactions);
  const income = calculateTotalIncome(transactions);
  const expenses = calculateTotalExpenses(transactions);
  const recent = getRecentTransactions(transactions, 5);

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <StatusBar style={appTheme === 'dark' ? 'light' : 'dark'} />

      {/* --- HEADER --- */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.greeting, { color: theme.text }]}>{t('Hola, Usuario')}</Text>
          <Text style={[styles.subGreeting, { color: theme.textSecondary }]}>{t('Tu resumen financiero')}</Text>
        </View>
        <TouchableOpacity style={[styles.profileButton, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <MaterialCommunityIcons name="bell-outline" size={24} color={theme.text} />
          <View style={styles.notificationDot} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* --- MAIN BALANCE CARD --- */}
        <View style={[styles.mainCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.balanceLabel, { color: theme.textSecondary }]}>{t('Saldo Total')}</Text>
          <Text style={[styles.balanceAmount, { color: theme.text }]}>{formatCurrency(balance)}</Text>

          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <View style={[styles.summaryIcon, { backgroundColor: 'rgba(16, 185, 129, 0.15)' }]}>
                <MaterialCommunityIcons name="arrow-up" size={20} color="#10B981" />
              </View>
              <View>
                <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>{t('Ingresos')}</Text>
                <Text style={styles.summaryValueIncome}>{formatCurrency(income)}</Text>
              </View>
            </View>

            <View style={styles.summaryItem}>
              <View style={[styles.summaryIcon, { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
                <MaterialCommunityIcons name="arrow-down" size={20} color="#EF4444" />
              </View>
              <View>
                <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>{t('Gastos')}</Text>
                <Text style={styles.summaryValueExpense}>{formatCurrency(expenses)}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* --- RECENT TRANSACTIONS --- */}
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>{t('Movimientos Recientes')}</Text>
          <TouchableOpacity onPress={() => navigation.navigate('Transacciones')}>
            <Text style={[styles.seeAllText, { color: accentColor }]}>{t('Ver todo')}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.transactionsList}>
          {recent.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="database-off" size={48} color={theme.textMuted} />
              <Text style={[styles.emptyText, { color: theme.textMuted }]}>{t('No hay movimientos recientes')}</Text>
            </View>
          ) : (
            recent.map((item) => (
              <View key={item.id} style={[styles.transactionCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={styles.transactionLeft}>
                  <View style={[styles.categoryIcon, { backgroundColor: theme.background }]}>
                    <Text style={styles.categoryEmoji}>{CATEGORY_LABELS[item.category]?.emoji || '📦'}</Text>
                  </View>
                  <View>
                    <Text style={[styles.transactionTitle, { color: theme.text }]}>{CATEGORY_LABELS[item.category]?.label || item.category}</Text>
                    <Text style={[styles.transactionDate, { color: theme.textSecondary }]}>{formatDate(item.date)}</Text>
                  </View>
                </View>
                <Text style={[
                  styles.transactionAmount,
                  { color: item.type === 'ingreso' ? '#10B981' : '#EF4444' }
                ]}>
                  {item.type === 'ingreso' ? '+' : '-'} {formatCurrency(item.amount)}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* --- FLOATING ACTION BUTTON --- */}
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: accentColor, shadowColor: accentColor }]}
        onPress={() => navigation.navigate('Transacciones')}
        activeOpacity={0.8}
      >
        <MaterialCommunityIcons name="plus" size={30} color="#FFFFFF" />
        <Text style={styles.fabText}>{t('Añadir')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0F172A', // Azul pizarra muy oscuro
    paddingTop: Platform.OS === 'android' ? 40 : 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingBottom: 24,
    paddingTop: 20,
  },
  greeting: {
    fontSize: 24,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  subGreeting: {
    fontSize: 14,
    color: '#94A3B8',
    marginTop: 2,
  },
  profileButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  notificationDot: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EF4444',
    borderWidth: 2,
    borderColor: '#1E293B',
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 100,
  },
  mainCard: {
    backgroundColor: '#1E293B',
    borderRadius: 24,
    padding: 24,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: '#334155',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  balanceLabel: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  balanceAmount: {
    color: '#FFFFFF',
    fontSize: 38,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 24,
    letterSpacing: -1,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  summaryItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(15, 23, 42, 0.5)',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  summaryIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
  },
  summaryValueIncome: {
    color: '#10B981',
    fontSize: 16,
    fontWeight: '700',
  },
  summaryValueExpense: {
    color: '#EF4444',
    fontSize: 16,
    fontWeight: '700',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  seeAllText: {
    color: '#6366F1',
    fontSize: 14,
    fontWeight: '600',
  },
  transactionsList: {
    gap: 12,
  },
  transactionCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1E293B',
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#334155',
  },
  transactionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  categoryIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#0F172A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryEmoji: {
    fontSize: 20,
  },
  transactionTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
  transactionDate: {
    color: '#64748B',
    fontSize: 12,
    marginTop: 2,
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: '700',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    color: '#64748B',
    fontSize: 14,
    marginTop: 12,
  },
  fab: {
    position: 'absolute',
    bottom: 30,
    right: 24,
    backgroundColor: '#6366F1', // Color acento eléctrico
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 30,
    elevation: 8,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
  },
  fabText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 8,
  },
});
