export type BankName = 'bhd' | 'scotiabank' | 'banreservas' | 'banco-popular' | 'banco';

export type TransactionType = 'ingreso' | 'gasto';

export type BankCategory =
  | 'comida'
  | 'transporte'
  | 'entretenimiento'
  | 'servicios'
  | 'salud'
  | 'educacion'
  | 'salario'
  | 'ahorro'
  | 'otros';

export interface ParsedTransaction {
  gmailMessageId: string;
  amount: number;
  currency: 'DOP' | 'USD';
  type: TransactionType;
  category: BankCategory;
  date: string;
  merchant: string;
  note: string;
  bank: string;
}

export interface EmailInput {
  gmailMessageId: string;
  sender: string;
  subject: string;
  body: string;
}
