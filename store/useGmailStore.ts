import { create } from 'zustand';
import type { Category, Transaction, TransactionType } from '../types/transaction';
import { useTransactionStore } from './useTransactionStore';
import { supabase } from '../utils/supabase';

interface GmailConnection {
  gmail_email: string;
  last_synced_at: string;
  last_error: string | null;
}

interface BankEmailTransaction {
  gmail_message_id: string;
  amount: number;
  type: TransactionType;
  category: Category;
  occurred_at: string;
  note: string;
}

interface GmailDisconnectResult {
  connected: boolean;
  revocationConfirmed: boolean;
}

interface GmailState {
  connection: GmailConnection | null;
  isLoading: boolean;
  error: string | null;
  loadConnection: () => Promise<void>;
  loadImportedTransactions: () => Promise<void>;
  disconnect: () => Promise<void>;
  clearError: () => void;
}

export const useGmailStore = create<GmailState>((set) => ({
  connection: null,
  isLoading: false,
  error: null,

  loadConnection: async () => {
    if (!supabase) return;
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase
        .from('gmail_connection_status')
        .select('gmail_email, last_synced_at, last_error')
        .maybeSingle();
      if (error) throw error;
      set({ connection: data, isLoading: false });
    } catch (error: unknown) {
      set({
        error: error instanceof Error ? error.message : 'No se pudo consultar la conexión de Gmail.',
        isLoading: false,
      });
    }
  },

  loadImportedTransactions: async () => {
    if (!supabase) return;
    try {
      if (!useTransactionStore.getState().isLoaded) {
        await useTransactionStore.getState().loadTransactions();
      }
      const { data, error } = await supabase
        .from('bank_email_transactions')
        .select('gmail_message_id, amount, type, category, occurred_at, note')
        .order('occurred_at', { ascending: false });
      if (error) throw error;

      const imported: Transaction[] = ((data ?? []) as BankEmailTransaction[]).map((transaction) => ({
        id: `gmail:bhd:${transaction.gmail_message_id}`,
        amount: Number(transaction.amount),
        type: transaction.type,
        category: transaction.category,
        date: transaction.occurred_at,
        note: transaction.note,
      }));
      await useTransactionStore.getState().importBankTransactions(imported);
      set({ error: null });
    } catch (error: unknown) {
      set({ error: error instanceof Error ? error.message : 'No se pudieron cargar los movimientos de Gmail.' });
    }
  },

  disconnect: async () => {
    if (!supabase) return;
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase.functions.invoke<GmailDisconnectResult>('gmail-disconnect', { body: {} });
      if (error) throw error;
      if (!data || data.connected || typeof data.revocationConfirmed !== 'boolean') {
        throw new Error('No se pudo confirmar la desconexión de Gmail.');
      }
      set({
        connection: null,
        isLoading: false,
        error: data.revocationConfirmed
          ? null
          : 'Financia se desconectó de Gmail, pero Google no confirmó la revocación. Revisa el acceso de Financia en tu cuenta de Google.',
      });
    } catch (error: unknown) {
      set({
        error: error instanceof Error ? error.message : 'No se pudo desconectar Gmail.',
        isLoading: false,
      });
    }
  },

  clearError: () => set({ error: null }),
}));
