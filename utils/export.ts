import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Transaction } from '../types/transaction';
import { CATEGORY_LABELS } from '../types/transaction';

/**
 * Transforms a list of transactions into a CSV string and triggers the OS share sheet.
 * @param transactions Array of transactions to export.
 * @returns Promise that resolves when the sharing process has been initiated.
 */
type FileSystemWithOptionalPaths = typeof FileSystem & {
  documentDirectory?: string;
  cacheDirectory?: string;
};

export async function exportTransactionsToCSV(transactions: Transaction[]): Promise<void> {
  const header = ['Fecha', 'Tipo', 'Categoría', 'Monto', 'Nota'];
  const rows: string[] = [header.join(',')];

  transactions.forEach((t) => {
    const date = new Date(t.date).toLocaleDateString('es-DO');
    const type = t.type === 'ingreso' ? 'Ingreso' : 'Gasto';
    const category = CATEGORY_LABELS[t.category]?.label || t.category;
    const amount = t.amount.toFixed(2);
    const note = t.note ? `"${t.note.replace(/"/g, '""')}"` : '""';

    rows.push(`${date},${type},${category},${amount},${note}`);
  });

  const csvString = rows.join('\n');

  try {
    if (Platform.OS === 'web') {
      const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Financia_Export_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      return;
    }

    const fileSystem = FileSystem as FileSystemWithOptionalPaths;
    const fileName = `Financia_Export_${new Date().toISOString().split('T')[0]}.csv`;
    const fileUri = `${fileSystem.documentDirectory ?? fileSystem.cacheDirectory ?? ''}${fileName}`;

    await FileSystem.writeAsStringAsync(fileUri, csvString, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        mimeType: 'text/csv',
        dialogTitle: 'Exportar mis finanzas',
        UTI: 'public.comma-separated-values-text',
      });
    } else {
      throw new Error('El servicio de compartir no está disponible en este dispositivo.');
    }
  } catch (error) {
    console.error('Error exporting CSV:', error);
    throw error;
  }
}
