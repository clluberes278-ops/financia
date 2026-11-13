import { create } from 'zustand';
import type { Category, Currency, Transaction, TransactionType } from '../types/transaction';
import { useTransactionStore } from './useTransactionStore';
import { supabase } from '../utils/supabase';

interface GmailConnection {
  gmail_email: string;
  last_synced_at: string;
  last_error: string | null;
}

interface BankEmailTransaction {
  bank?: string;
  gmail_message_id: string;
  currency: Currency;
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
    const owner = useTransactionStore.getState().owner;
    if (!owner?.startsWith('user:')) return;
    set({ isLoading: true, error: null });
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if ('user:' + sessionData.session?.user.id !== owner) return;
      const { data, error } = await supabase
        .from('gmail_connection_status')
        .select('gmail_email, last_synced_at, last_error')
        .eq('user_id', sessionData.session!.user.id)
        .maybeSingle();
      if (error) throw error;
      if (useTransactionStore.getState().owner === owner) set({ connection: data, isLoading: false });
    } catch (error: unknown) {
      if (useTransactionStore.getState().owner !== owner) return;
      set({
        error: error instanceof Error ? error.message : 'No se pudo consultar la conexión de Gmail.',
        isLoading: false,
      });
    }
  },

  loadImportedTransactions: async () => {
    if (!supabase) return;
    const owner = useTransactionStore.getState().owner;
    if (!owner?.startsWith('user:') || !useTransactionStore.getState().isLoaded) return;
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if ('user:' + sessionData.session?.user.id !== owner) return;
      const { data, error } = await supabase
        .from('bank_email_transactions')
        .select('bank, gmail_message_id, amount, currency, type, category, occurred_at, note')
        .eq('user_id', sessionData.session!.user.id)
        .order('occurred_at', { ascending: false });
      if (error) throw error;

      const imported: Transaction[] = ((data ?? []) as BankEmailTransaction[]).map((transaction) => ({
        id: `gmail:${transaction.bank ?? 'bhd'}:${transaction.gmail_message_id}`,
        amount: Number(transaction.amount),
        currency: transaction.currency,
        type: transaction.type,
        category: transaction.category,
        date: transaction.occurred_at,
        note: transaction.note,
      }));
      if (useTransactionStore.getState().owner !== owner) return;
      await useTransactionStore.getState().importBankTransactions(imported, owner);
      if (useTransactionStore.getState().owner === owner) set({ error: null });
    } catch (error: unknown) {
      if (useTransactionStore.getState().owner === owner) set({ error: error instanceof Error ? error.message : 'No se pudieron cargar los movimientos de Gmail.' });
    }
  },

  disconnect: async () => {
    if (!supabase) return;
    const owner = useTransactionStore.getState().owner;
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase.functions.invoke<GmailDisconnectResult>('gmail-disconnect', { body: {} });
      if (error) throw error;
      if (useTransactionStore.getState().owner !== owner) return;
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
      if (useTransactionStore.getState().owner !== owner) return;
      set({
        error: error instanceof Error ? error.message : 'No se pudo desconectar Gmail.',
        isLoading: false,
      });
    }
  },

  clearError: () => set({ error: null }),
}));
