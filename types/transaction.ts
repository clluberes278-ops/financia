export type TransactionType = 'ingreso' | 'gasto';

export type Category =
  | 'comida'
  | 'transporte'
  | 'entretenimiento'
  | 'servicios'
  | 'salud'
  | 'educacion'
  | 'salario'
  | 'ahorro'
  | 'otros';

export interface Transaction {
  id: string;
  amount: number; // siempre positivo; el signo lo determina "type"
  type: TransactionType;
  category: Category;
  date: string; // ISO string, ej: "2026-09-24T10:00:00.000Z"
  note?: string;
}

// Etiquetas legibles + emoji para mostrar en la UI sin depender de íconos externos
export const CATEGORY_LABELS: Record<Category, { label: string; emoji: string }> = {
  comida: { label: 'Comida', emoji: '🍔' },
  transporte: { label: 'Transporte', emoji: '🚗' },
  entretenimiento: { label: 'Entretenimiento', emoji: '🎮' },
  servicios: { label: 'Servicios', emoji: '💡' },
  salud: { label: 'Salud', emoji: '🏥' },
  educacion: { label: 'Educación', emoji: '📚' },
  salario: { label: 'Salario', emoji: '💰' },
  ahorro: { label: 'Ahorro', emoji: '🎯' },
  otros: { label: 'Otros', emoji: '📦' },
};

