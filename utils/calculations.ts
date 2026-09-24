import { Transaction, Category } from '../types/transaction';

/**
 * El saldo NUNCA se guarda como número aparte — siempre se deriva de la lista
 * de transacciones. Esto evita que se desincronice si olvidas actualizarlo
 * manualmente en algún punto de la app.
 */
export function calculateBalance(transactions: Transaction[]): number {
  return transactions.reduce((total, t) => {
    return t.type === 'ingreso' ? total + t.amount : total - t.amount;
  }, 0);
}

export function calculateTotalIncome(transactions: Transaction[]): number {
  return transactions
    .filter((t) => t.type === 'ingreso')
    .reduce((sum, t) => sum + t.amount, 0);
}

export function calculateTotalExpenses(transactions: Transaction[]): number {
  return transactions
    .filter((t) => t.type === 'gasto')
    .reduce((sum, t) => sum + t.amount, 0);
}

/**
 * Agrupa los gastos por categoría para alimentar el gráfico del dashboard.
 * Devuelve solo categorías con gasto > 0, ordenadas de mayor a menor.
 */
export function groupExpensesByCategory(
  transactions: Transaction[]
): { category: Category; total: number }[] {
  const totals = new Map<Category, number>();

  transactions
    .filter((t) => t.type === 'gasto')
    .forEach((t) => {
      totals.set(t.category, (totals.get(t.category) ?? 0) + t.amount);
    });

  return Array.from(totals.entries())
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);
}

export function getRecentTransactions(
  transactions: Transaction[],
  limit = 5
): Transaction[] {
  return [...transactions]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, limit);
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('es-DO', {
    style: 'currency',
    currency: 'DOP',
  }).format(amount);
}

export function formatDate(dateString: string): string {
  try {
    const d = new Date(dateString);
    return new Intl.DateTimeFormat('es-DO', {
      day: 'numeric',
      month: 'short',
    }).format(d);
  } catch {
    return dateString;
  }
}

export function formatMonthYear(year: number, month: number): string {
  const date = new Date(year, month, 1);
  const formatted = new Intl.DateTimeFormat('es-DO', {
    month: 'long',
    year: 'numeric',
  }).format(date);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export function getTransactionsByMonth(
  transactions: Transaction[],
  year: number,
  month: number
): Transaction[] {
  return transactions.filter((t) => {
    const d = new Date(t.date);
    return d.getFullYear() === year && d.getMonth() === month;
  });
}

export function getAvailableMonths(
  transactions: Transaction[]
): { year: number; month: number; label: string }[] {
  const current = new Date();
  const currentEntry = {
    year: current.getFullYear(),
    month: current.getMonth(),
    label: formatMonthYear(current.getFullYear(), current.getMonth()),
  };

  if (transactions.length === 0) {
    return [currentEntry];
  }

  const set = new Map<string, { year: number; month: number; label: string }>();
  set.set(`${currentEntry.year}-${currentEntry.month}`, currentEntry);

  transactions.forEach((t) => {
    const d = new Date(t.date);
    const y = d.getFullYear();
    const m = d.getMonth();
    const key = `${y}-${m}`;
    if (!set.has(key)) {
      set.set(key, { year: y, month: m, label: formatMonthYear(y, m) });
    }
  });

  return Array.from(set.values()).sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    return b.month - a.month;
  });
}

export function calculateSavingsRate(income: number, expenses: number): number {
  if (income <= 0) return 0;
  const savings = income - expenses;
  if (savings <= 0) return 0;
  return Math.round((savings / income) * 100);
}

export function getDailyAverageExpense(
  expenses: number,
  year: number,
  month: number
): number {
  const today = new Date();
  let days = new Date(year, month + 1, 0).getDate();
  // Si es el mes en curso, promediar hasta el día de hoy
  if (today.getFullYear() === year && today.getMonth() === month) {
    days = Math.max(1, today.getDate());
  }
  return expenses / days;
}

export function getHighestExpense(transactions: Transaction[]): Transaction | null {
  const expenses = transactions.filter((t) => t.type === 'gasto');
  if (expenses.length === 0) return null;
  return expenses.reduce((max, t) => (t.amount > max.amount ? t : max), expenses[0]);
}

// ── Chart Data Helpers ────────────────────────────────────────────────────────

/**
 * Returns daily expense totals for the last N days (for bar chart).
 * Each item: { value, label, dayLabel }
 */
export function getWeeklyExpenses(
  transactions: Transaction[],
  days = 7
): { value: number; label: string; frontColor: string }[] {
  const result: { value: number; label: string; frontColor: string }[] = [];
  const today = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dayStr = d.toISOString().split('T')[0];

    const total = transactions
      .filter((t) => t.type === 'gasto' && t.date.startsWith(dayStr))
      .reduce((sum, t) => sum + t.amount, 0);

    const dayNames = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'];
    result.push({
      value: total,
      label: dayNames[d.getDay()],
      frontColor: i === 0 ? '#4F46E5' : '#818CF8',
    });
  }
  return result;
}

/**
 * Returns monthly totals for the last N months (for line chart).
 * Each item: { value, label }
 */
export function getMonthlyTrend(
  transactions: Transaction[],
  months = 6
): { value: number; dataPointText: string; label: string }[] {
  const result: { value: number; dataPointText: string; label: string }[] = [];
  const today = new Date();

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const y = d.getFullYear();
    const m = d.getMonth();

    const total = transactions
      .filter((t) => {
        if (t.type !== 'gasto') return false;
        const td = new Date(t.date);
        return td.getFullYear() === y && td.getMonth() === m;
      })
      .reduce((sum, t) => sum + t.amount, 0);

    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    result.push({
      value: Math.round(total),
      dataPointText: total > 0 ? `${Math.round(total / 1000)}K` : '',
      label: monthNames[m],
    });
  }
  return result;
}
