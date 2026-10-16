import { Platform } from 'react-native';
import * as Print from 'expo-print';
import { Transaction, CATEGORY_LABELS } from '../types/transaction';
import {
  calculateTotalIncome,
  calculateTotalExpenses,
  calculateSavingsRate,
  groupExpensesByCategory,
  formatCurrency,
  formatDate,
  formatMonthYear,
} from './calculations';

export async function exportReportAsPdf(
  transactions: Transaction[],
  year: number,
  month: number,
  periodLabel?: string
): Promise<void> {
  const monthLabel = formatMonthYear(year, month);
  const reportPeriodLabel = periodLabel ?? monthLabel;
  const income = calculateTotalIncome(transactions);
  const expenses = calculateTotalExpenses(transactions);
  const netSavings = income - expenses;
  const savingsRate = calculateSavingsRate(income, expenses);
  const byCategory = groupExpensesByCategory(transactions);

  const sorted = [...transactions].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const signColor = netSavings >= 0 ? '#10B981' : '#EF4444';
  const sign = netSavings >= 0 ? '+' : '';

  const categoryRows = byCategory
    .map(({ category, total }) => {
      const cat = CATEGORY_LABELS[category];
      const pct = expenses > 0 ? Math.round((total / expenses) * 100) : 0;
      return `
        <tr>
          <td>${cat.emoji} ${cat.label}</td>
          <td style="text-align:right; font-weight:700;">${formatCurrency(total)}</td>
          <td style="text-align:right;">${pct}%</td>
        </tr>
        <tr>
          <td colspan="3" style="padding: 0 0 10px;">
            <div style="height:6px; background:#F1F5F9; border-radius:3px;">
              <div style="height:6px; width:${pct}%; background:#4F46E5; border-radius:3px;"></div>
            </div>
          </td>
        </tr>`;
    })
    .join('');

  const now = new Date().toLocaleString('es-DO', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Informe Financia - ${reportPeriodLabel}</title>
  <style>
    @page { size: 360px auto; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #F8FAFC;
      color: #0F172A;
      padding: 18px;
    }
    .header {
      background: #0F172A;
      border-radius: 16px;
      padding: 22px 18px;
      margin-bottom: 18px;
      color: #fff;
    }
    .header-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 18px;
    }
    .brand { display: flex; align-items: center; gap: 10px; }
    .chip {
      width: 32px; height: 22px;
      background: #F59E0B;
      border-radius: 5px;
    }
    .brand-name {
      font-size: 14px; font-weight: 800;
      letter-spacing: 1px; color: #94A3B8;
    }
    .generated { font-size: 12px; color: #64748B; text-align: right; }
    .report-title { font-size: 24px; font-weight: 800; margin-bottom: 5px; }
    .report-period { font-size: 14px; color: #94A3B8; }
    .kpi-row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin-bottom: 20px;
    }
    .kpi-card {
      flex: 1;
      background: #fff;
      border-radius: 12px;
      padding: 14px 12px;
      box-shadow: 0 2px 8px rgba(15,23,42,0.06);
    }
    .kpi-label {
      font-size: 12px; color: #64748B; font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.5px;
      margin-bottom: 6px;
    }
    .kpi-value { font-size: 18px; font-weight: 800; color: #0F172A; word-break: break-word; }
    .section-title {
      font-size: 17px; font-weight: 800;
      margin-bottom: 10px;
    }
    .table-card {
      background: #fff;
      border-radius: 14px;
      padding: 14px;
      margin-bottom: 20px;
      box-shadow: 0 2px 8px rgba(15,23,42,0.06);
    }
    table { width: 100%; border-collapse: collapse; }
    th {
      text-align: left; font-size: 12px; color: #94A3B8;
      font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.5px; padding-bottom: 10px;
      border-bottom: 1px solid #F1F5F9;
    }
    td {
      padding: 11px 4px;
      font-size: 14px;
      border-bottom: 1px solid #F8FAFC;
      vertical-align: middle;
    }
    tr:last-child td { border-bottom: none; }
    .transaction-item {
      padding: 11px 0;
      border-bottom: 1px solid #F1F5F9;
    }
    .transaction-item:last-child { border-bottom: none; }
    .transaction-top {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      align-items: flex-start;
    }
    .transaction-category { font-size: 14px; font-weight: 700; }
    .transaction-amount { font-size: 14px; font-weight: 800; white-space: nowrap; }
    .transaction-meta { color: #64748B; font-size: 12px; margin-top: 4px; }
    .footer {
      text-align: center;
      font-size: 12px; color: #CBD5E1;
      margin-top: 12px;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-top">
      <div class="brand">
        <div class="chip"></div>
        <span class="brand-name">FINANCIA SMART</span>
      </div>
      <div class="generated">Generado el<br/>${now}</div>
    </div>
    <div class="report-title">Informe Financiero</div>
    <div class="report-period">Periodo: ${reportPeriodLabel}</div>
  </div>

  <div class="kpi-row">
    <div class="kpi-card">
      <div class="kpi-label">Ingresos</div>
      <div class="kpi-value" style="color:#10B981;">${formatCurrency(income)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Gastos</div>
      <div class="kpi-value" style="color:#EF4444;">${formatCurrency(expenses)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Balance neto</div>
      <div class="kpi-value" style="color:${signColor};">${sign}${formatCurrency(netSavings)}</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">Tasa de ahorro</div>
      <div class="kpi-value">${savingsRate}%</div>
    </div>
  </div>

  ${byCategory.length > 0 ? `
  <div class="section-title">Gastos por Categoria</div>
  <div class="table-card">
    <table>
      <thead>
        <tr>
          <th>Categoria</th>
          <th style="text-align:right;">Total</th>
          <th style="text-align:right;">% del gasto</th>
        </tr>
      </thead>
      <tbody>${categoryRows}</tbody>
    </table>
  </div>` : ''}

  <div class="section-title">Detalle de Movimientos (${sorted.length})</div>
  <div class="table-card">
    ${sorted.length === 0
      ? '<p style="color:#94A3B8;font-size:13px;text-align:center;padding:20px 0;">Sin movimientos en este periodo.</p>'
      : `<div class="transaction-list">${sorted.map((t) => {
          const isIncome = t.type === 'ingreso';
          const cat = CATEGORY_LABELS[t.category] || { label: t.category, emoji: '🏷️' };
          const color = isIncome ? '#10B981' : '#EF4444';
          const prefix = isIncome ? '+' : '-';
          return `<div class="transaction-item">
            <div class="transaction-top">
              <div class="transaction-category">${cat.emoji} ${cat.label}</div>
              <div class="transaction-amount" style="color:${color};">${prefix} ${formatCurrency(t.amount)}</div>
            </div>
            <div class="transaction-meta">${formatDate(t.date)}${t.note ? ` · ${t.note}` : ''}</div>
          </div>`;
        }).join('')}</div>`}
  </div>

  <div class="footer">Generado por Financia Smart · Solo para uso personal · Datos almacenados localmente en tu dispositivo</div>
</body>
</html>`;

  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const win = window.open('', '_blank', 'noopener,noreferrer');
    if (!win) throw new Error('No se pudo abrir la vista de impresión.');
    win.document.write(html);
    win.document.close();
    win.focus();
    win.print();
    return;
  }

  const { uri } = await Print.printToFileAsync({
    html,
    width: 360,
    height: 800,
    textZoom: 110,
    margins: { top: 0, right: 0, bottom: 0, left: 0 },
    base64: false,
  });

  if (typeof navigator !== 'undefined' && navigator.userAgent.includes('Expo')) {
    await Print.printAsync({ uri });
    return;
  }

  const sharing = await import('expo-sharing');
  if (await sharing.isAvailableAsync()) {
    await sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      dialogTitle: `Informe Financia - ${monthLabel}`,
      UTI: 'com.adobe.pdf',
    });
  } else {
    await Print.printAsync({ html });
  }
}
