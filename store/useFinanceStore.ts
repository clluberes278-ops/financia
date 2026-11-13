import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { emptySnapshot, type FinancialSnapshot, type NewPocket } from '../types/finance';
import type { Transaction } from '../types/transaction';
import { createFinancialRepository, assertAmount, isCurrency } from '../utils/financialRepository';
import { supabase } from '../utils/supabase';
import { financeApiUrl, requestFinance } from '../utils/financeApi';
import { createRemoteFinanceRepository } from '../utils/remoteFinanceRepository';
const localRepository = createFinancialRepository(AsyncStorage);
const repository = financeApiUrl ? createRemoteFinanceRepository(localRepository, requestFinance) : localRepository;
let epoch = 0;
let sequence = 0;
const newId = (): string => Date.now().toString(36) + '-' + (++sequence).toString(36) + '-' + Math.random().toString(36).slice(2);
const round = (value: number): number => Math.round(value * 100) / 100;
interface FinanceStore extends FinancialSnapshot {
  owner: string | null;
  isLoaded: boolean;
  error: string | null;
  hasLegacyData: boolean;
  activateOwner: (owner: string) => Promise<void>;
  loadTransactions: () => Promise<void>;
  loadPockets: () => Promise<void>;
  addTransaction: (data: Omit<Transaction, 'id' | 'pocketId'>) => Promise<void>;
  importBankTransactions: (data: Transaction[], expectedOwner: string) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  clearAllTransactions: () => Promise<void>;
  clearAllPockets: () => Promise<void>;
  clearAllData: () => Promise<void>;
  createPocket: (data: NewPocket) => Promise<void>;
  depositToPocket: (id: string, amount: number) => Promise<void>;
  withdrawFromPocket: (id: string, amount: number) => Promise<void>;
  deletePocket: (id: string) => Promise<void>;
}
export const useFinanceStore = create<FinanceStore>((set, get) => {
  async function mutate(transform: (snapshot: FinancialSnapshot) => FinancialSnapshot): Promise<void> {
    const { owner, isLoaded } = get();
    const startedEpoch = epoch;
    if (!owner || !isLoaded) throw new Error('Espera a que se cargue tu espacio financiero.');
    const snapshot = await repository.update(owner, current => {
      if (startedEpoch !== epoch || get().owner !== owner) throw new Error('La cuenta cambió. Vuelve a intentar la operación.');
      return transform(current);
    });
    if (startedEpoch === epoch && get().owner === owner) set({ ...snapshot, error: null });
  }
  async function hideImported(transactions: Transaction[]): Promise<void> {
    const ids = transactions.filter(t => t.id.startsWith('gmail:')).map(t => t.id.replace(/^gmail:[^:]+:/, ''));
    if (!ids.length) return;
    if (!supabase || !get().owner?.startsWith('user:')) throw new Error('Inicia sesión para eliminar movimientos importados.');
    const expectedOwner = get().owner;
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    if ('user:' + data.session?.user.id !== expectedOwner) throw new Error('La cuenta cambió.');
    const { error } = await supabase.from('bank_email_transactions').update({ is_hidden: true }).in('gmail_message_id', ids).eq('user_id', data.session!.user.id);
    if (error) throw error;
    if (get().owner !== expectedOwner) throw new Error('La cuenta cambió.');
  }
  function transfer(id: string, amount: number, type: 'gasto' | 'ingreso'): Promise<void> {
    assertAmount(amount);
    return mutate(current => {
      const pocket = current.pockets.find(p => p.id === id);
      if (!pocket) throw new Error('El bolsillo ya no existe.');
      const balance = round(current.transactions.filter(t => t.currency === pocket.currency).reduce((sum, t) => sum + (t.type === 'ingreso' ? t.amount : -t.amount), 0));
      if (type === 'gasto' && amount > balance) throw new Error('Saldo insuficiente en la moneda del bolsillo.');
      if (type === 'ingreso' && amount > pocket.currentAmount) throw new Error('El retiro supera lo disponible en el bolsillo.');
      const movement: Transaction = { id: newId(), currency: pocket.currency, amount, type, category: 'ahorro', pocketId: id,
        date: new Date().toISOString(), note: (type === 'gasto' ? 'Abono a bolsillo: ' : 'Retiro de bolsillo: ') + pocket.name };
      return { ...current, transactions: [movement, ...current.transactions], pockets: current.pockets.map(p => p.id === id
        ? { ...p, currentAmount: round(p.currentAmount + (type === 'gasto' ? amount : -amount)) } : p) };
    });
  }
  return {
    ...emptySnapshot(), owner: null, isLoaded: false, error: null, hasLegacyData: false,
    activateOwner: async owner => {
      if (get().owner === owner && get().isLoaded) return;
      const startedEpoch = ++epoch;
      set({ ...emptySnapshot(), owner, isLoaded: false, error: null, hasLegacyData: false });
      try {
        const [snapshot, hasLegacyData] = await Promise.all([repository.read(owner), repository.hasLegacyData()]);
        if (startedEpoch === epoch) set({ ...snapshot, isLoaded: true, hasLegacyData });
      } catch (error: unknown) {
        if (startedEpoch === epoch) set({ error: error instanceof Error ? error.message : 'No se pudo cargar el historial. Vuelve a intentarlo.' });
      }
    },
    loadTransactions: async () => { if (!get().isLoaded) throw new Error('El historial todavía no está listo.'); },
    loadPockets: async () => { if (!get().isLoaded) throw new Error('Los bolsillos todavía no están listos.'); },
    addTransaction: async data => {
      assertAmount(data.amount);
      if (!isCurrency(data.currency)) throw new Error('Selecciona DOP o USD.');
      if (data.category === 'ahorro') throw new Error('Usa la pantalla Ahorro para transferir dinero a tus bolsillos.');
      await mutate(current => ({ ...current, transactions: [{ ...data, id: newId() }, ...current.transactions] }));
    },
    importBankTransactions: async (data, expectedOwner) => {
      if (get().owner !== expectedOwner || !expectedOwner.startsWith('user:')) throw new Error('La cuenta cambió durante la importación.');
      await mutate(current => {
        const existing = new Map(current.transactions.map(t => [t.id, t]));
        for (const transaction of data) {
          if (!transaction.id.startsWith('gmail:')) throw new Error('Identificador de importación inválido.');
          existing.set(transaction.id, transaction);
        }
        return { ...current, transactions: [...existing.values()] };
      });
    },
    deleteTransaction: async id => {
      const expectedOwner = get().owner;
      const transaction = get().transactions.find(t => t.id === id);
      if (!transaction) return;
      if (transaction.pocketId || transaction.category === 'ahorro') throw new Error('Las transferencias de ahorro se revierten desde el bolsillo.');
      await hideImported([transaction]);
      if (get().owner !== expectedOwner) throw new Error('La cuenta cambió.');
      await mutate(current => ({ ...current, transactions: current.transactions.filter(t => t.id !== id) }));
    },
    clearAllTransactions: async () => {
      if (get().pockets.some(p => p.currentAmount > 0)) throw new Error('Retira el dinero de tus bolsillos antes de borrar el historial.');
      const expectedOwner = get().owner;
      await hideImported(get().transactions);
      if (get().owner !== expectedOwner) throw new Error('La cuenta cambió.');
      await mutate(current => {
        if (current.pockets.some(p => p.currentAmount > 0)) throw new Error('Retira el dinero de los bolsillos antes de borrar.');
        return { ...current, transactions: [] };
      });
    },
    clearAllPockets: async () => {
      await mutate(current => {
        if (current.pockets.some(p => p.currentAmount > 0)) throw new Error('Retira el dinero de tus bolsillos antes de eliminarlos.');
        return { ...current, pockets: [] };
      });
    },
    clearAllData: async () => {
      const expectedOwner = get().owner;
      await hideImported(get().transactions);
      if (get().owner !== expectedOwner) throw new Error('La cuenta cambió.');
      await mutate(() => emptySnapshot());
    },
    createPocket: async data => {
      assertAmount(data.targetAmount);
      if (!data.name.trim() || !isCurrency(data.currency)) throw new Error('Ingresa un nombre y una moneda para la meta.');
      await mutate(current => ({ ...current, pockets: [{ id: newId(), name: data.name.trim(), targetAmount: data.targetAmount,
        currency: data.currency, emoji: data.emoji?.trim() || '🎯', currentAmount: 0, createdAt: new Date().toISOString() }, ...current.pockets] }));
    },
    depositToPocket: (id, amount) => transfer(id, amount, 'gasto'),
    withdrawFromPocket: (id, amount) => transfer(id, amount, 'ingreso'),
    deletePocket: async id => mutate(current => {
      const pocket = current.pockets.find(p => p.id === id);
      if (!pocket) throw new Error('El bolsillo ya no existe.');
      const transactions: Transaction[] = pocket.currentAmount > 0 ? [{ id: newId(), currency: pocket.currency, amount: pocket.currentAmount,
        type: 'ingreso', category: 'ahorro', pocketId: id, date: new Date().toISOString(), note: 'Devolución por bolsillo eliminado: ' + pocket.name }, ...current.transactions] : current.transactions;
      return { ...current, transactions, pockets: current.pockets.filter(p => p.id !== id) };
    }),
  };
});
