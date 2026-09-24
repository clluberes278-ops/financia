import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Dimensions,
} from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { useTransactionStore } from '../store/useTransactionStore';
import {
  calculateBalance,
  calculateTotalIncome,
  calculateTotalExpenses,
  groupExpensesByCategory,
  getRecentTransactions,
  formatCurrency,
  formatDate,
  calculateSavingsRate,
  getWeeklyExpenses,
} from '../utils/calculations';
import { CATEGORY_LABELS } from '../types/transaction';

import { useSavingsStore } from '../store/useSavingsStore';

const SCREEN_WIDTH = Dimensions.get('window').width;

export default function DashboardScreen() {
  const { transactions, loadTransactions, isLoaded } = useTransactionStore();
  const { pockets, loadPockets, isLoaded: savingsLoaded } = useSavingsStore();
  const [hideBalance, setHideBalance] = useState(false);

  // Carga los datos guardados una sola vez al montar
  useEffect(() => {
    if (!isLoaded) loadTransactions();
    if (!savingsLoaded) loadPockets();
  }, [isLoaded, savingsLoaded]);

  const balance = calculateBalance(transactions);
  const income = calculateTotalIncome(transactions);
  const expenses = calculateTotalExpenses(transactions);
  const byCategory = groupExpensesByCategory(transactions);
  const recent = getRecentTransactions(transactions, 5);
  const savingsRate = calculateSavingsRate(income, expenses);
  const weeklyData = getWeeklyExpenses(transactions, 7);

  const totalInPockets = pockets.reduce((acc, p) => acc + p.currentAmount, 0);
  const totalTargetInPockets = pockets.reduce((acc, p) => acc + p.targetAmount, 0);
  const pocketsProgress =
    totalTargetInPockets > 0
      ? Math.min(100, Math.round((totalInPockets / totalTargetInPockets) * 100))
      : 0;

  const getFinancialStatus = () => {
    if (income === 0 && expenses === 0) return { label: 'Sin actividad', color: '#94A3B8' };
    if (savingsRate >= 30) return { label: 'Excelente ritmo de ahorro', color: '#10B981' };
    if (savingsRate > 0) return { label: 'Ahorro positivo', color: '#3B82F6' };
    if (expenses > income) return { label: 'Gastos superan ingresos', color: '#EF4444' };
    return { label: 'Equilibrado', color: '#F59E0B' };
  };

  const status = getFinancialStatus();

  return (
    <View style={styles.screenWrapper}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Tarjeta Smart Bank Principal */}
        <View style={styles.smartCard}>
          {/* Header de la tarjeta */}
          <View style={styles.cardHeader}>
            <View style={styles.cardBrand}>
              <View style={styles.chipGraphic} />
              <Text style={styles.brandTitle}>FINANCIA SMART</Text>
            </View>
            <Pressable
              onPress={() => setHideBalance(!hideBalance)}
              style={styles.eyeToggle}
              hitSlop={10}
            >
              <Text style={styles.eyeIcon}>{hideBalance ? '👁️‍🗨️' : '👁️'}</Text>
            </Pressable>
          </View>

          {/* Saldo Disponible */}
          <Text style={styles.balanceLabel}>Saldo disponible</Text>
          <Text style={styles.balanceAmount}>
            {hideBalance ? '••••••••' : formatCurrency(balance)}
          </Text>

          {/* Fila de Ingresos y Gastos */}
          <View style={styles.cardStatsRow}>
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>Ingresos</Text>
              <Text style={styles.incomeStat}>
                {hideBalance ? '••••' : `+ ${formatCurrency(income)}`}
              </Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>Gastos</Text>
              <Text style={styles.expenseStat}>
                {hideBalance ? '••••' : `- ${formatCurrency(expenses)}`}
              </Text>
            </View>
          </View>
        </View>

        {/* Tarjeta Destacada de Bolsillos de Ahorro */}
        <View style={styles.savingsCard}>
          <View style={styles.savingsHeader}>
            <View style={styles.savingsTitleRow}>
              <Text style={styles.savingsEmoji}>🎯</Text>
              <Text style={styles.savingsTitle} numberOfLines={1}>
                Bolsillos de Ahorro
              </Text>
            </View>
            <View style={styles.savingsPill}>
              <Text style={styles.savingsPillText}>
                {pockets.length} {pockets.length === 1 ? 'meta' : 'metas'}
              </Text>
            </View>
          </View>

          {/* Bloque de Total Apartado */}
          <View style={styles.savingsMainBlock}>
            <Text style={styles.savingsAmountLabel}>Total apartado en bolsillos</Text>
            <Text style={styles.savingsMainAmount} numberOfLines={1}>
              {hideBalance ? '••••••••' : formatCurrency(totalInPockets)}
            </Text>
          </View>

          {totalTargetInPockets > 0 ? (
            <View style={styles.savingsProgressSection}>
              <View style={styles.savingsMetaRow}>
                <Text style={styles.savingsProgressPct}>{pocketsProgress}% completado</Text>
                <Text style={styles.savingsMetaTarget} numberOfLines={1}>
                  Meta: {hideBalance ? '••••' : formatCurrency(totalTargetInPockets)}
                </Text>
              </View>
              <View style={styles.savingsProgressBarBg}>
                <View
                  style={[
                    styles.savingsProgressBarFill,
                    {
                      width: `${pocketsProgress}%`,
                      backgroundColor: pocketsProgress >= 100 ? '#10B981' : '#4F46E5',
                    },
                  ]}
                />
              </View>
            </View>
          ) : (
            <Text style={styles.savingsEmptyHint}>
              💡 Ve a la pestaña Ahorro para apartar dinero con metas fijas.
            </Text>
          )}
        </View>

        {/* Widget de Salud Financiera y Resumen */}
        <View style={styles.healthWidget}>
          <View style={styles.healthHeader}>
            <Text style={styles.healthTitle}>Salud Financiera</Text>
            <View style={[styles.statusBadge, { backgroundColor: `${status.color}18` }]}>
              <View style={[styles.statusDot, { backgroundColor: status.color }]} />
              <Text style={[styles.statusText, { color: status.color }]} numberOfLines={1}>
                {status.label}
              </Text>
            </View>
          </View>

          <View style={styles.healthStatsRow}>
            <View style={styles.healthStatItem}>
              <Text style={styles.healthStatNumber}>{savingsRate}%</Text>
              <Text style={styles.healthStatLabel}>Tasa ahorro</Text>
            </View>

            <View style={styles.healthDivider} />

            <View style={styles.healthStatItem}>
              <Text style={styles.healthStatNumber}>{transactions.length}</Text>
              <Text style={styles.healthStatLabel}>Operaciones</Text>
            </View>

            <View style={styles.healthDivider} />

            <View style={styles.healthStatItem}>
              <Text style={styles.healthStatNumber}>{byCategory.length}</Text>
              <Text style={styles.healthStatLabel}>Categorías</Text>
            </View>
          </View>
        </View>

        {/* Sección: Gráfica de barras semanal */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Gastos esta semana</Text>
        </View>
        <View style={styles.chartCard}>
          {weeklyData.every((d) => d.value === 0) ? (
            <View style={styles.chartEmpty}>
              <Text style={styles.chartEmptyText}>Sin gastos registrados esta semana</Text>
            </View>
          ) : (
            <BarChart
              data={weeklyData}
              barWidth={28}
              spacing={14}
              roundedTop
              roundedBottom
              hideRules
              xAxisThickness={0}
              yAxisThickness={0}
              yAxisTextStyle={{ color: '#94A3B8', fontSize: 10 }}
              xAxisLabelTextStyle={{ color: '#64748B', fontSize: 11, fontWeight: '600' }}
              noOfSections={4}
              maxValue={Math.max(...weeklyData.map((d) => d.value), 1) * 1.2}
              barBorderRadius={6}
              width={SCREEN_WIDTH - 80}
              height={140}
              isAnimated
            />
          )}
        </View>

        {/* Sección: Gastos por Categoría */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Distribución de gastos</Text>
          {byCategory.length > 0 && (
            <Text style={styles.sectionMeta}>{byCategory.length} categorías</Text>
          )}
        </View>

        {byCategory.length === 0 ? (
          <View style={styles.emptyCardMini}>
            <Text style={styles.emptyTextMini}>No hay gastos registrados en el historial</Text>
          </View>
        ) : (
          <View style={styles.categoriesCard}>
            {byCategory.map(({ category, total }) => {
              const percent = expenses > 0 ? Math.round((total / expenses) * 100) : 0;
              const cat = CATEGORY_LABELS[category];
              return (
                <View key={category} style={styles.categoryItem}>
                  <View style={styles.categoryInfoRow}>
                    <Text style={styles.categoryName}>
                      {cat.emoji} {cat.label}
                    </Text>
                    <View style={styles.categoryAmountRow}>
                      <Text style={styles.categoryPercent}>{percent}%</Text>
                      <Text style={styles.categoryTotal}>{formatCurrency(total)}</Text>
                    </View>
                  </View>
                  <View style={styles.barBackground}>
                    <View style={[styles.barFill, { width: `${percent}%` }]} />
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Sección: Últimas Transacciones */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Actividad reciente</Text>
        </View>

        {recent.length === 0 ? (
          <View style={styles.emptyCardMini}>
            <Text style={styles.emptyTextMini}>Sin movimientos recientes</Text>
          </View>
        ) : (
          <View style={styles.recentList}>
            {recent.map((t) => {
              const isIncome = t.type === 'ingreso';
              const cat = CATEGORY_LABELS[t.category] || {
                label: t.category,
                emoji: '🏷️',
              };

              return (
                <View key={t.id} style={styles.recentItem}>
                  <View style={styles.recentLeft}>
                    <View
                      style={[
                        styles.recentEmojiBox,
                        isIncome ? styles.recentEmojiIncome : styles.recentEmojiExpense,
                      ]}
                    >
                      <Text style={styles.recentEmoji}>{cat.emoji}</Text>
                    </View>
                    <View>
                      <Text style={styles.recentCategory}>{cat.label}</Text>
                      <Text style={styles.recentDate}>
                        {t.note ? `${t.note} • ` : ''}
                        {formatDate(t.date)}
                      </Text>
                    </View>
                  </View>
                  <Text
                    style={
                      isIncome ? styles.recentIncomeAmount : styles.recentExpenseAmount
                    }
                  >
                    {isIncome ? '+' : '-'} {formatCurrency(t.amount)}
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
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
  smartCard: {
    backgroundColor: '#0F172A',
    borderRadius: 22,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardBrand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chipGraphic: {
    width: 28,
    height: 20,
    borderRadius: 4,
    backgroundColor: '#F59E0B',
    borderWidth: 1,
    borderColor: '#D97706',
  },
  brandTitle: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  eyeToggle: {
    padding: 4,
  },
  eyeIcon: {
    fontSize: 16,
  },
  balanceLabel: {
    color: '#94A3B8',
    fontSize: 13,
    fontWeight: '500',
  },
  balanceAmount: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginVertical: 4,
  },
  cardStatsRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 10,
    alignItems: 'center',
  },
  statCol: {
    flex: 1,
  },
  statLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
  },
  incomeStat: {
    color: '#34D399',
    fontSize: 13,
    fontWeight: '700',
  },
  expenseStat: {
    color: '#F87171',
    fontSize: 13,
    fontWeight: '700',
  },
  statDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginHorizontal: 12,
  },
  savingsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#EEF2FF',
  },
  savingsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    gap: 8,
  },
  savingsTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  savingsEmoji: {
    fontSize: 20,
  },
  savingsTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    flexShrink: 1,
  },
  savingsPill: {
    backgroundColor: '#EEF2FF',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  savingsPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4F46E5',
  },
  savingsMainBlock: {
    marginBottom: 10,
  },
  savingsAmountLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  savingsMainAmount: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0F172A',
  },
  savingsProgressSection: {
    marginTop: 2,
  },
  savingsMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  savingsProgressPct: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4F46E5',
  },
  savingsMetaTarget: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
  },
  savingsProgressBarBg: {
    height: 7,
    backgroundColor: '#F1F5F9',
    borderRadius: 4,
    overflow: 'hidden',
  },
  savingsProgressBarFill: {
    height: 7,
    borderRadius: 4,
  },
  savingsEmptyHint: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 17,
  },
  healthWidget: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  healthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    gap: 8,
  },
  healthTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    flexShrink: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    gap: 5,
    maxWidth: '55%',
    flexShrink: 1,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  healthStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  healthStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  healthStatNumber: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 2,
  },
  healthStatLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  healthDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#E2E8F0',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.3,
  },
  sectionMeta: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  categoriesCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  categoryItem: {
    marginBottom: 14,
  },
  categoryInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  categoryName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1E293B',
  },
  categoryAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  categoryPercent: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6366F1',
  },
  categoryTotal: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  barBackground: {
    height: 7,
    backgroundColor: '#F1F5F9',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: 7,
    backgroundColor: '#4F46E5',
    borderRadius: 4,
  },
  recentList: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  recentItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  recentLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  recentEmojiBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentEmojiIncome: {
    backgroundColor: '#ECFDF5',
  },
  recentEmojiExpense: {
    backgroundColor: '#FEF2F2',
  },
  recentEmoji: {
    fontSize: 20,
  },
  recentCategory: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  recentDate: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  recentIncomeAmount: {
    fontSize: 14,
    fontWeight: '800',
    color: '#10B981',
  },
  recentExpenseAmount: {
    fontSize: 14,
    fontWeight: '800',
    color: '#EF4444',
  },
  emptyCardMini: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    marginBottom: 20,
  },
  emptyTextMini: {
    color: '#94A3B8',
    fontSize: 13,
  },
  chartCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    overflow: 'hidden',
  },
  chartEmpty: {
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartEmptyText: {
    color: '#94A3B8',
    fontSize: 13,
  },
});
