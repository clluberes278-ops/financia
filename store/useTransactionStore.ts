import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Transaction } from '../types/transaction';
import { supabase } from '../utils/supabase';

const STORAGE_KEY = '@financia_transactions';
let loadingTransactions: Promise<void> | null = null;

interface TransactionStore {
  transactions: Transaction[];
  isLoaded: boolean;
  loadTransactions: () => Promise<void>;
  addTransaction: (t: Omit<Transaction, 'id'>) => Promise<void>;
  importBankTransactions: (transactions: Transaction[]) => Promise<void>;
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
    if (get().isLoaded) return;
    if (!loadingTransactions) {
      loadingTransactions = (async () => {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        set({ transactions: raw ? JSON.parse(raw) : [], isLoaded: true });
      })();
    }
    try {
      await loadingTransactions;
    } finally {
      loadingTransactions = null;
    }
  },

  addTransaction: async (t) => {
    const newTransaction: Transaction = { ...t, id: Date.now().toString() };
    const updated = [newTransaction, ...get().transactions];
    set({ transactions: updated });
    await persist(updated);
  },

  importBankTransactions: async (transactions) => {
    const existingIds = new Set(get().transactions.map((transaction) => transaction.id));
    const newTransactions = transactions.filter((transaction) => !existingIds.has(transaction.id));
    if (newTransactions.length === 0) return;

    const updated = [...newTransactions, ...get().transactions];
    set({ transactions: updated });
    await persist(updated);
  },

  deleteTransaction: async (id) => {
    const importedMatch = /^gmail:(?:.+):(.+)$/.exec(id);
    if (importedMatch && supabase) {
      const gmailMessageId = importedMatch[1];
      const { error } = await supabase
        .from('bank_email_transactions')
        .update({ is_hidden: true })
        .eq('gmail_message_id', gmailMessageId);
      if (error) throw error;
    }

    const updated = get().transactions.filter((t) => t.id !== id);
    set({ transactions: updated });
    await persist(updated);
  },

  clearAllTransactions: async () => {
    const importedMessageIds = get().transactions
      .filter((transaction) => /^gmail:/.test(transaction.id))
      .map((transaction) => transaction.id.replace(/^gmail:[^:]+:/, ''));
    if (supabase && importedMessageIds.length > 0) {
      const { error } = await supabase
        .from('bank_email_transactions')
        .update({ is_hidden: true })
        .in('gmail_message_id', importedMessageIds);
      if (error) throw error;
    }

    set({ transactions: [] });
    await persist([]);
  },
}));
