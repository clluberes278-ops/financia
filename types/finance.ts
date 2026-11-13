import type { Transaction, Currency } from './transaction';
import type { SavingsPocket } from './savings';
export interface FinancialSnapshot { version: 1; transactions: Transaction[]; pockets: SavingsPocket[] }
export interface NewPocket { name: string; targetAmount: number; currency: Currency; emoji?: string }
export const emptySnapshot = (): FinancialSnapshot => ({ version: 1, transactions: [], pockets: [] });
