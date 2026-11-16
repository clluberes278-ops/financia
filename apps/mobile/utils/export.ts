import { shareTextFile } from './fileSharing';
import { Transaction } from '../types/transaction';
import { CATEGORY_LABELS } from '../types/transaction';

/**
 * Transforms a list of transactions into a CSV string and triggers the OS share sheet.
 * @param transactions Array of transactions to export.
 * @returns Promise that resolves when the sharing process has been initiated.
 */

export async function exportTransactionsToCSV(transactions: Transaction[]): Promise<void> {
  const header = ['Fecha', 'Tipo', 'Categoría', 'Monto', 'Moneda', 'Nota'];
  const rows: string[] = [header.join(',')];

  transactions.forEach((t) => {
    const date = new Date(t.date).toLocaleDateString('es-DO');
    const type = t.type === 'ingreso' ? 'Ingreso' : 'Gasto';
    const category = CATEGORY_LABELS[t.category]?.label || t.category;
    const amount = t.amount.toFixed(2);
    const note = t.note ? `"${t.note.replace(/"/g, '""')}"` : '""';

    rows.push(`${date},${type},${category},${amount},${t.currency},${note}`);
  });

  const csvString = rows.join('\n');

  const fileName = `Financia_Export_${new Date().toISOString().split('T')[0]}.csv`;
  await shareTextFile(fileName, csvString, 'text/csv', 'Exportar mis finanzas');
}
