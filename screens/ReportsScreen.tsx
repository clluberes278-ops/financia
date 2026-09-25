import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { PieChart, LineChart } from 'react-native-gifted-charts';
import { exportReportAsPdf } from '../utils/generatePdf';
import { useTransactionStore } from '../store/useTransactionStore';
import {
  getAvailableMonths,
  getTransactionsByMonth,
  calculateTotalIncome,
  calculateTotalExpenses,
  groupExpensesByCategory,
  calculateSavingsRate,
  getDailyAverageExpense,
  getHighestExpense,
  formatCurrency,
  formatMonthYear,
  formatDate,
  getMonthlyTrend,
} from '../utils/calculations';
import { CATEGORY_LABELS, Category } from '../types/transaction';
import { useSettingsStore } from '../store/useSettingsStore';
import { useTranslation } from '../utils/translations';

const SCREEN_WIDTH = Dimensions.get('window').width;

const PIE_COLORS = ['#4F46E5','#10B981','#F59E0B','#EF4444','#3B82F6','#8B5CF6','#EC4899','#06B6D4','#14B8A6'];

export default function ReportsScreen() {
  const { transactions } = useTransactionStore();
  const accentColor = useSettingsStore((state) => state.accentColor);
  const { t } = useTranslation();

  const availableMonths = getAvailableMonths(transactions);
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(0);
  const [isExporting, setIsExporting] = useState(false);

  const currentMonthData = availableMonths[selectedMonthIndex] || {
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
    label: formatMonthYear(new Date().getFullYear(), new Date().getMonth()),
  };

  const monthTransactions = getTransactionsByMonth(
    transactions,
    currentMonthData.year,
    currentMonthData.month
  );

  const monthIncome = calculateTotalIncome(monthTransactions);
  const monthExpenses = calculateTotalExpenses(monthTransactions);
  const netSavings = monthIncome - monthExpenses;
  const savingsRate = calculateSavingsRate(monthIncome, monthExpenses);
  const dailyAverage = getDailyAverageExpense(
    monthExpenses,
    currentMonthData.year,
    currentMonthData.month
  );
  const monthlyTrend = getMonthlyTrend(transactions, 6);
  const byCategory = groupExpensesByCategory(monthTransactions);
  const highestExpense = getHighestExpense(monthTransactions);

  const pieData = byCategory.map(({ category, total }, i) => ({
    value: total,
    color: PIE_COLORS[i % PIE_COLORS.length],
    text: CATEGORY_LABELS[category as Category]?.emoji ?? '',
    label: t(CATEGORY_LABELS[category as Category]?.label ?? category),
  }));

  const expenseRatio = monthIncome > 0 ? Math.min(100, Math.round((monthExpenses / monthIncome) * 100)) : 100;

  const handlePrevMonth = () => {
    if (selectedMonthIndex < availableMonths.length - 1) {
      setSelectedMonthIndex(selectedMonthIndex + 1);
    }
  };

  const handleNextMonth = () => {
    if (selectedMonthIndex > 0) {
      setSelectedMonthIndex(selectedMonthIndex - 1);
    }
  };

  const handleExport = async () => {
    if (isExporting) return;
    setIsExporting(true);
    try {
      await exportReportAsPdf(monthTransactions, currentMonthData.year, currentMonthData.month);
    } catch (err) {
      Alert.alert(t('Error'), t('No se pudo generar el PDF. Inténtalo de nuevo.'));
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <View style={styles.screenWrapper}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
      >
        {/* Selector de Período */}
        <View style={styles.periodSelectorCard}>
          <Pressable
            style={[styles.arrowButton, selectedMonthIndex >= availableMonths.length - 1 && styles.arrowDisabled]}
            onPress={handlePrevMonth}
            disabled={selectedMonthIndex >= availableMonths.length - 1}
          >
            <Text style={styles.arrowText}>◀</Text>
          </Pressable>

          <View style={styles.periodCenter}>
            <Text style={styles.periodLabel}>{t('Período de análisis')}</Text>
            <Text style={styles.periodTitle}>{currentMonthData.label}</Text>
          </View>

          <Pressable
            style={[styles.arrowButton, selectedMonthIndex <= 0 && styles.arrowDisabled]}
            onPress={handleNextMonth}
            disabled={selectedMonthIndex <= 0}
          >
            <Text style={styles.arrowText}>▶</Text>
          </Pressable>
        </View>

        {/* Botón Exportar PDF */}
        <Pressable
          style={[styles.exportButton, { backgroundColor: accentColor, shadowColor: accentColor }, isExporting && styles.exportButtonDisabled]}
          onPress={handleExport}
          disabled={isExporting}
        >
          {isExporting ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.exportButtonText}>📄 {t('Exportar PDF')}</Text>
          )}
        </Pressable>

        {/* Resumen Ejecutivo del Mes */}
        <View style={styles.executiveCard}>
          <View style={styles.cardHeaderRow}>
              <Text style={styles.executiveSubtitle}>{t('BALANCE MENSUAL')}</Text>
            <View
              style={[
                styles.savingsBadge,
                netSavings >= 0 ? styles.savingsBadgePositive : styles.savingsBadgeNegative,
              ]}
            >
              <Text
                style={[
                  styles.savingsBadgeText,
                  netSavings >= 0 ? styles.savingsTextPositive : styles.savingsTextNegative,
                ]}
              >
                {netSavings >= 0 ? 'Ahorro Positivo' : 'Déficit'}
              </Text>
            </View>
          </View>

          <Text style={styles.netSavingsAmount}>
            {netSavings >= 0 ? '+' : ''}
            {formatCurrency(netSavings)}
          </Text>
          <Text style={styles.netSavingsNote}>
            {monthIncome > 0
              ? `Has ahorrado el ${savingsRate}% de tus ingresos este mes`
              : 'Registra tus ingresos para calcular tu tasa de ahorro'}
          </Text>

          {/* Comparativa Ingresos vs Gastos */}
          <View style={styles.splitRow}>
            <View style={styles.splitItem}>
              <Text style={styles.splitLabel}>{t('Ingresos')}</Text>
              <Text style={styles.splitIncome} numberOfLines={1}>
                {formatCurrency(monthIncome)}
              </Text>
            </View>
            <View style={styles.splitDivider} />
            <View style={styles.splitItem}>
              <Text style={styles.splitLabel}>{t('Gastos')}</Text>
              <Text style={styles.splitExpense} numberOfLines={1}>
                {formatCurrency(monthExpenses)}
              </Text>
            </View>
          </View>

          {/* Barra de Proporción Gastos / Ingresos */}
          {monthIncome > 0 && (
            <View style={styles.ratioSection}>
              <View style={styles.ratioHeader}>
                <Text style={styles.ratioLabel}>{t('Uso del ingreso')}</Text>
                <Text style={styles.ratioPercent}>{expenseRatio}% gastado</Text>
              </View>
              <View style={styles.ratioTrack}>
                <View
                  style={[
                    styles.ratioFill,
                    {
                      width: `${expenseRatio}%`,
                      backgroundColor: expenseRatio > 90 ? '#EF4444' : expenseRatio > 70 ? '#F59E0B' : '#10B981',
                    },
                  ]}
                />
              </View>
            </View>
          )}
        </View>

        {/* Indicadores Clave (KPIs) */}
        <Text style={styles.sectionTitle}>{t('Métricas Inteligentes')}</Text>
        <View style={styles.kpiGrid}>
          {/* Promedio diario */}
          <View style={styles.kpiCard}>
            <Text style={styles.kpiIcon}>📅</Text>
            <Text style={styles.kpiValue} numberOfLines={1}>
              {formatCurrency(dailyAverage)}
            </Text>
            <Text style={styles.kpiLabel}>{t('Gasto promedio / día')}</Text>
          </View>

          {/* Tasa de ahorro */}
          <View style={styles.kpiCard}>
            <Text style={styles.kpiIcon}>🎯</Text>
            <Text style={styles.kpiValue} numberOfLines={1}>
              {savingsRate}%
            </Text>
            <Text style={styles.kpiLabel}>{t('Tasa de ahorro mensual')}</Text>
          </View>

          {/* Mayor gasto */}
          <View style={styles.kpiCard}>
            <Text style={styles.kpiIcon}>🔥</Text>
            <Text style={styles.kpiValue} numberOfLines={1}>
              {highestExpense ? formatCurrency(highestExpense.amount) : 'RD$ 0.00'}
            </Text>
            <Text style={styles.kpiLabel} numberOfLines={1}>
              {highestExpense?.note || 'Mayor gasto puntual'}
            </Text>
          </View>

          {/* Operaciones del mes */}
          <View style={styles.kpiCard}>
            <Text style={styles.kpiIcon}>🔢</Text>
            <Text style={styles.kpiValue} numberOfLines={1}>
              {monthTransactions.length}
            </Text>
            <Text style={styles.kpiLabel}>{t('Movimientos en el mes')}</Text>
          </View>
        </View>

        {/* Gráfica de dona: Gastos por categoría */}
        {byCategory.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>{t('Distribución visual de gastos')}</Text>
            <View style={styles.chartCard}>
              <View style={styles.pieRow}>
                <PieChart
                  data={pieData}
                  donut
                  radius={80}
                  innerRadius={50}
                  innerCircleColor={'#FFFFFF'}
                  centerLabelComponent={() => (
                    <View style={styles.pieCenterLabel}>
                      <Text style={styles.pieCenterValue} numberOfLines={1}>
                        {byCategory.length}
                      </Text>
                      <Text style={styles.pieCenterSub}>{t('categ.')}</Text>
                    </View>
                  )}
                />
                <View style={styles.pieLegend}>
                  {pieData.map((item, i) => (
                    <View key={i} style={styles.pieLegendItem}>
                      <View style={[styles.pieLegendDot, { backgroundColor: item.color }]} />
                      <Text style={styles.pieLegendLabel} numberOfLines={1}>
                        {item.text} {item.label}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          </>
        )}

        {/* Gráfica de línea: Tendencia mensual (6 meses) */}
        <Text style={styles.sectionTitle}>{t('Tendencia de gastos (6 meses)')}</Text>
        <View style={styles.chartCard}>
          {monthlyTrend.every((d) => d.value === 0) ? (
            <View style={styles.chartEmpty}>
              <Text style={styles.chartEmptyText}>{t('Sin datos de tendencia aún')}</Text>
            </View>
          ) : (
            <LineChart
              data={monthlyTrend}
              color={accentColor}
              thickness={3}
              dataPointsColor={accentColor}
              dataPointsRadius={5}
              startFillColor={accentColor}
              endFillColor={'#F8FAFC'}
              startOpacity={0.2}
              endOpacity={0.01}
              areaChart
              hideRules
              xAxisThickness={0}
              yAxisThickness={0}
              yAxisTextStyle={{ color: '#94A3B8', fontSize: 10 }}
              xAxisLabelTextStyle={{ color: '#64748B', fontSize: 11, fontWeight: '600' }}
              width={SCREEN_WIDTH - 80}
              height={140}
              curved
              isAnimated
              noOfSections={4}
            />
          )}
        </View>

        {/* Desglose de Gastos por Categoría */}
        <Text style={styles.sectionTitle}>{t('Gastos por Categoría')}</Text>
        {byCategory.length === 0 ? (
          <View style={styles.emptyStateCard}>
            <Text style={styles.emptyEmoji}>🍃</Text>
            <Text style={styles.emptyTitle}>{t('Sin gastos en')} {currentMonthData.label}</Text>
            <Text style={styles.emptySubtitle}>
              No se han registrado gastos para el período seleccionado.
            </Text>
          </View>
        ) : (
          <View style={styles.categoriesContainer}>
            {byCategory.map(({ category, total }) => {
              const cat = CATEGORY_LABELS[category];
              const pct = monthExpenses > 0 ? Math.round((total / monthExpenses) * 100) : 0;
              const count = monthTransactions.filter((t) => t.category === category && t.type === 'gasto').length;

              return (
                <View key={category} style={styles.categoryCard}>
                  <View style={styles.categoryHeader}>
                    <View style={styles.catLeft}>
                      <Text style={styles.catEmoji}>{cat.emoji}</Text>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={styles.catName} numberOfLines={1}>
                          {cat.label}
                        </Text>
                        <Text style={styles.catCount}>
                          {count} {count === 1 ? 'registro' : 'registros'}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.catRight}>
                      <Text style={styles.catAmount} numberOfLines={1}>
                        {formatCurrency(total)}
                      </Text>
                      <Text style={styles.catPercent}>{pct}% del total</Text>
                    </View>
                  </View>

                  <View style={styles.catBarBackground}>
                    <View style={[styles.catBarFill, { width: `${pct}%` }]} />
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Últimas operaciones del período */}
        {monthTransactions.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>{t('Detalle del período')} ({monthTransactions.length})</Text>
            <View style={styles.transactionsListCard}>
              {monthTransactions.map((t) => {
                const isIncome = t.type === 'ingreso';
                const cat = CATEGORY_LABELS[t.category] || { label: t.category, emoji: '🏷️' };

                return (
                  <View key={t.id} style={styles.tRow}>
                    <View style={styles.tLeft}>
                      <Text style={styles.tEmoji}>{cat.emoji}</Text>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={styles.tTitle} numberOfLines={1}>
                          {cat.label}
                        </Text>
                        <Text style={styles.tMeta} numberOfLines={1}>
                          {t.note ? `${t.note} • ` : ''}
                          {formatDate(t.date)}
                        </Text>
                      </View>
                    </View>
                    <Text
                      style={isIncome ? styles.tAmountIncome : styles.tAmountExpense}
                      numberOfLines={1}
                    >
                      {isIncome ? '+' : '-'} {formatCurrency(t.amount)}
                    </Text>
                  </View>
                );
              })}
            </View>
          </>
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
  periodSelectorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  arrowButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowDisabled: {
    opacity: 0.3,
  },
  arrowText: {
    fontSize: 14,
    color: '#0F172A',
    fontWeight: '700',
  },
  periodCenter: {
    alignItems: 'center',
  },
  periodLabel: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  periodTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  executiveCard: {
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
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  executiveSubtitle: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  savingsBadge: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  savingsBadgePositive: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
  },
  savingsBadgeNegative: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
  },
  savingsBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  savingsTextPositive: {
    color: '#34D399',
  },
  savingsTextNegative: {
    color: '#F87171',
  },
  netSavingsAmount: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginVertical: 4,
  },
  netSavingsNote: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '500',
    marginBottom: 16,
  },
  splitRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  splitItem: {
    flex: 1,
  },
  splitLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
  },
  splitIncome: {
    color: '#34D399',
    fontSize: 15,
    fontWeight: '700',
  },
  splitExpense: {
    color: '#F87171',
    fontSize: 15,
    fontWeight: '700',
  },
  splitDivider: {
    width: 1,
    height: 26,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    marginHorizontal: 14,
  },
  ratioSection: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
  },
  ratioHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  ratioLabel: {
    color: '#94A3B8',
    fontSize: 11,
    fontWeight: '600',
  },
  ratioPercent: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  ratioTrack: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  ratioFill: {
    height: 6,
    borderRadius: 3,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 12,
    letterSpacing: -0.3,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 24,
  },
  kpiCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  kpiIcon: {
    fontSize: 22,
    marginBottom: 8,
  },
  kpiValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 2,
  },
  kpiLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  categoriesContainer: {
    gap: 10,
    marginBottom: 24,
  },
  categoryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1.5,
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  catLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  catEmoji: {
    fontSize: 24,
  },
  catName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  catCount: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '500',
  },
  catRight: {
    alignItems: 'flex-end',
  },
  catAmount: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  catPercent: {
    fontSize: 11,
    color: '#6366F1',
    fontWeight: '700',
  },
  catBarBackground: {
    height: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 3,
    overflow: 'hidden',
  },
  catBarFill: {
    height: 6,
    backgroundColor: '#4F46E5',
    borderRadius: 3,
  },
  emptyStateCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyEmoji: {
    fontSize: 32,
    marginBottom: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
  },
  transactionsListCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 1.5,
  },
  tRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  tLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  tEmoji: {
    fontSize: 20,
  },
  tTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  tMeta: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 1,
  },
  tAmountIncome: {
    fontSize: 13,
    fontWeight: '800',
    color: '#10B981',
  },
  tAmountExpense: {
    fontSize: 13,
    fontWeight: '800',
    color: '#EF4444',
  },
  exportButton: {
    backgroundColor: '#4F46E5',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  exportButtonDisabled: {
    opacity: 0.6,
  },
  exportButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  chartCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    marginBottom: 24,
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
  pieRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  pieCenterLabel: {
    alignItems: 'center',
  },
  pieCenterValue: {
    fontSize: 22,
    fontWeight: '800',
    color: '#0F172A',
  },
  pieCenterSub: {
    fontSize: 11,
    color: '#94A3B8',
    fontWeight: '600',
  },
  pieLegend: {
    flex: 1,
    gap: 8,
  },
  pieLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pieLegendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  pieLegendLabel: {
    fontSize: 12,
    color: '#374151',
    fontWeight: '600',
    flex: 1,
  },
});
