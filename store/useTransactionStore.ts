import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Transaction } from '../types/transaction';

const STORAGE_KEY = '@financia_transactions';

interface TransactionStore {
  transactions: Transaction[];
  isLoaded: boolean;
  loadTransactions: () => Promise<void>;
  addTransaction: (t: Omit<Transaction, 'id'>) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  clearAllTransactions: () => Promise<void>;
}

// Guarda en AsyncStorage cada vez que la lista cambia, para no perder datos
// al cerrar la app.
async function persist(transactions: Transaction[]) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
}

export const useTransactionStore = create<TransactionStore>((set, get) => ({
  transactions: [],
  isLoaded: false,

  loadTransactions: async () => {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    set({ transactions: raw ? JSON.parse(raw) : [], isLoaded: true });
  },

  addTransaction: async (t) => {
    const newTransaction: Transaction = { ...t, id: Date.now().toString() };
    const updated = [newTransaction, ...get().transactions];
    set({ transactions: updated });
    await persist(updated);
  },

  deleteTransaction: async (id) => {
    const updated = get().transactions.filter((t) => t.id !== id);
    set({ transactions: updated });
    await persist(updated);
  },

  clearAllTransactions: async () => {
    set({ transactions: [] });
    await persist([]);
  },
}));
