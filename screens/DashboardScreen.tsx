import CurrencySelector from '../components/CurrencySelector';
import { useCurrencyStore } from '../store/useCurrencyStore';
import React from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { StatusBar } from 'react-native';
import { MaterialDesignIcons as MaterialCommunityIcons } from '@react-native-vector-icons/material-design-icons/static';
import GradientView from '../components/GradientView';
import { useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { useTransactionStore } from '../store/useTransactionStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { getShadowStyle, getThemeColors, ThemedText } from '../utils/theme';
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
import type { MainTabParamList } from '../types/navigation';

const Text = ThemedText;

export default function DashboardScreen() {
  const { width } = useWindowDimensions();
  const navigation = useNavigation<BottomTabNavigationProp<MainTabParamList>>();
  const allTransactions = useTransactionStore(s => s.transactions);
  const currency = useCurrencyStore(s => s.currency);
  const { t } = useTranslation();
  const transactions = allTransactions.filter(t => t.currency === currency);
  const appTheme = useSettingsStore((state) => state.theme);
  const accentColor = useSettingsStore((state) => state.accentColor);
  const cardColor = useSettingsStore((state) => state.cardColor);
  const theme = getThemeColors(appTheme, cardColor);


  const balance = calculateBalance(transactions);
  const income = calculateTotalIncome(transactions);
  const expenses = calculateTotalExpenses(transactions);
  const recent = getRecentTransactions(transactions, 5);

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <StatusBar barStyle={appTheme === 'dark' ? 'light-content' : 'dark-content'} />

      {/* --- HEADER --- */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.greeting, { color: theme.text }]}>{t('Hola, Usuario')}</Text>
          <Text style={[styles.subGreeting, { color: theme.textSecondary }]}>{t('Tu resumen financiero')}</Text>
        </View>
        <TouchableOpacity style={[styles.profileButton, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <MaterialCommunityIcons name="bell-outline" size={23} color={accentColor} />
          <View style={styles.notificationDot} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingHorizontal: width < 360 ? 14 : 20 }]}
      >
        <CurrencySelector />
        {/* --- MAIN BALANCE CARD --- */}
        <GradientView
          colors={[theme.heroStart, theme.heroEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.mainCard}
        >
          <View style={styles.heroTopline}>
            <View style={styles.heroIcon}>
              <MaterialCommunityIcons name="wallet-outline" size={18} color="#FFFFFF" />
            </View>
            <Text style={styles.heroEyebrow}>{t('Financia Smart Bank')}</Text>
            <MaterialCommunityIcons name="creation" size={18} color="rgba(255,255,255,0.8)" />
          </View>
          <Text style={styles.balanceLabel}>{t('Saldo disponible')}</Text>
          <Text style={styles.balanceAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.55}>{formatCurrency(balance, currency)}</Text>

          <View style={styles.summaryRow}>
            <View style={styles.summaryItem}>
              <View style={[styles.summaryIcon, { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
                <MaterialCommunityIcons name="arrow-top-right" size={20} color="#FFFFFF" />
              </View>
              <View style={styles.summaryCopy}>
                <Text style={styles.summaryLabel}>{t('Ingresos')}</Text>
                <Text style={styles.summaryValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{formatCurrency(income, currency)}</Text>
              </View>
            </View>

            <View style={styles.summaryItem}>
              <View style={[styles.summaryIcon, { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
                <MaterialCommunityIcons name="arrow-bottom-right" size={20} color="#FFFFFF" />
              </View>
              <View style={styles.summaryCopy}>
                <Text style={styles.summaryLabel}>{t('Gastos')}</Text>
                <Text style={styles.summaryValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{formatCurrency(expenses, currency)}</Text>
              </View>
            </View>
          </View>
        </GradientView>

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
                  <View style={styles.transactionCopy}>
                    <Text style={[styles.transactionTitle, { color: theme.text }]}>{CATEGORY_LABELS[item.category]?.label || item.category}</Text>
                    <Text style={[styles.transactionDate, { color: theme.textSecondary }]}>{formatDate(item.date)}</Text>
                  </View>
                </View>
                <Text style={[
                  styles.transactionAmount,
                  { color: item.type === 'ingreso' ? theme.income : theme.expense }
                ]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                  {item.type === 'ingreso' ? '+' : '-'} {formatCurrency(item.amount, item.currency)}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {/* --- FLOATING ACTION BUTTON --- */}
      <TouchableOpacity
        onPress={() => navigation.navigate('Transacciones')}
        activeOpacity={0.85}
        style={[styles.fab, getShadowStyle({ color: accentColor, offsetX: 0, offsetY: 4, opacity: 0.32, radius: 14, elevation: 8 })]}
      >
        <GradientView colors={[accentColor, theme.heroEnd]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.fabGradient}>
          <MaterialCommunityIcons name="plus" size={25} color="#FFFFFF" />
          <Text style={styles.fabText}>{t('Añadir')}</Text>
        </GradientView>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingTop: Platform.OS === 'android' ? 40 : 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 18,
    paddingTop: 16,
  },
  greeting: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subGreeting: {
    fontSize: 14,
    marginTop: 2,
  },
  profileButton: {
    width: 48,
    height: 48,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
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
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  mainCard: {
    borderRadius: 30,
    padding: 22,
    marginBottom: 28,
    ...getShadowStyle({ color: '#6D28D9', offsetX: 0, offsetY: 12, opacity: 0.24, radius: 20, elevation: 9 }),
  },
  heroTopline: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 22,
  },
  heroIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
  },
  heroEyebrow: {
    flex: 1,
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  balanceLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.78)',
    marginBottom: 8,
  },
  balanceAmount: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: '800',
    marginBottom: 24,
    letterSpacing: -1,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  summaryItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    minWidth: 0,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  summaryCopy: { flex: 1, minWidth: 0 },
  summaryIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.75)',
  },
  summaryValue: {
    color: '#FFFFFF',
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
    fontSize: 18,
    fontWeight: '700',
  },
  seeAllText: {
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
    padding: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  transactionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  transactionCopy: { flex: 1, minWidth: 0 },
  categoryIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryEmoji: {
    fontSize: 20,
  },
  transactionTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  transactionDate: {
    fontSize: 12,
    marginTop: 2,
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: '700',
    flexShrink: 1,
    maxWidth: '45%',
    textAlign: 'right',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    marginTop: 12,
  },
  fab: {
    position: 'absolute',
    bottom: 30,
    right: 24,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    overflow: 'hidden',
  },
  fabGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 13,
  },
  fabText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 6,
  },
});
