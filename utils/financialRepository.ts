import { CATEGORY_LABELS, type Transaction, type Currency } from '../types/transaction';
import type { SavingsPocket } from '../types/savings';
import { emptySnapshot, type FinancialSnapshot } from '../types/finance';
export interface FinancialStorage {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
}
export const LEGACY_KEYS = ['@financia_transactions', '@financia_savings_pockets'] as const;
export const ownerKey = (owner: string): string => '@financia_finances_v1:' + encodeURIComponent(owner);
const object = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
export const isCurrency = (value: unknown): value is Currency => value === 'DOP' || value === 'USD';
const validMoney = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 999999999999.99 && Math.abs(Math.round(value * 100) - value * 100) < 0.000001;
const positive = (value: unknown): value is number => validMoney(value) && value > 0;
export function assertAmount(value: number): void {
  if (!positive(value)) throw new Error('Ingresa un monto positivo con hasta dos decimales.');
}
function isTransaction(value: unknown): value is Transaction {
  return object(value) && typeof value.id === 'string' && isCurrency(value.currency) && positive(value.amount)
    && (value.type === 'ingreso' || value.type === 'gasto') && typeof value.category === 'string'
    && Object.prototype.hasOwnProperty.call(CATEGORY_LABELS, value.category) && typeof value.date === 'string'
    && Number.isFinite(Date.parse(value.date)) && (value.note === undefined || typeof value.note === 'string')
    && (value.pocketId === undefined || typeof value.pocketId === 'string');
}
function isPocket(value: unknown): value is SavingsPocket {
  return object(value) && typeof value.id === 'string' && typeof value.name === 'string'
    && typeof value.emoji === 'string' && isCurrency(value.currency) && positive(value.targetAmount)
    && validMoney(value.currentAmount)
    && typeof value.createdAt === 'string' && Number.isFinite(Date.parse(value.createdAt));
}
export function parseSnapshot(raw: string | null): FinancialSnapshot {
  if (raw === null) return emptySnapshot();
  const value: unknown = JSON.parse(raw);
  if (!object(value) || value.version !== 1 || !Array.isArray(value.transactions) || !value.transactions.every(isTransaction)
    || !Array.isArray(value.pockets) || !value.pockets.every(isPocket)
    || new Set(value.transactions.map(t => t.id)).size !== value.transactions.length
    || new Set(value.pockets.map(p => p.id)).size !== value.pockets.length) {
    throw new Error('El historial guardado no se puede leer. Se conserva intacto; no se sobrescribirá.');
  }
  return { version: 1, transactions: value.transactions, pockets: value.pockets };
}
// Serializa lecturas y escrituras. Cada cambio guarda ambas colecciones en una clave.
export function createFinancialRepository(storage: FinancialStorage) {
  let queue: Promise<unknown> = Promise.resolve();
  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const pending = queue.then(work);
    queue = pending.catch(() => undefined);
    return pending;
  }
  return {
    read: (owner: string) => enqueue(async () => parseSnapshot(await storage.getItem(ownerKey(owner)))),
    update: (owner: string, transform: (snapshot: FinancialSnapshot) => FinancialSnapshot) => enqueue(async () => {
      const current = parseSnapshot(await storage.getItem(ownerKey(owner)));
      const next = transform(current);
      parseSnapshot(JSON.stringify(next));
      await storage.setItem(ownerKey(owner), JSON.stringify(next));
      return next;
    }),
    hasLegacyData: async () => {
      const values = await Promise.all(LEGACY_KEYS.map(key => storage.getItem(key)));
      return values.some(raw => raw !== null && raw !== '[]');
    },
  };
}
