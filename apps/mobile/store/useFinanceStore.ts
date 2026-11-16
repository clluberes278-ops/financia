import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { emptySnapshot, type FinancialSnapshot, type NewPocket } from '../types/finance';
import type { Transaction } from '../types/transaction';
import { createFinancialRepository, assertAmount, isCurrency } from '../utils/financialRepository';
import { supabase } from '../utils/supabase';
import { financeApiUrl } from '../utils/financeApi';
import { connectFinanceSession } from '../utils/connectedFinanceSession';
import type { CloudCommand, CloudFinanceState, MigrationInfo } from '../utils/cloudFinanceSession';
import type { FinanceRealtimeStatus } from '../utils/financeRealtime';
const localRepository = createFinancialRepository(AsyncStorage);
const repository = localRepository;
let epoch = 0;
let sequence = 0;
const newId = (): string => Date.now().toString(36) + '-' + (++sequence).toString(36) + '-' + Math.random().toString(36).slice(2);
const round = (value: number): number => Math.round(value * 100) / 100;
interface FinanceStore extends FinancialSnapshot {
  owner: string | null;
  isLoaded: boolean;
  error: string | null;
  hasLegacyData: boolean;
  syncMode: 'local' | 'cloud';
  syncStatus: 'local' | FinanceRealtimeStatus;
  isSyncing: boolean;
  cloudRevision: string | null;
  migration: MigrationInfo | null;
  pendingOperation: boolean;
  lastSyncedAt: number | null;
  refresh: () => Promise<boolean>;
  activateCloud: (startEmpty?: boolean) => Promise<void>;
  retryPending: () => Promise<void>;
  setSyncStatus: (owner: string, status: FinanceRealtimeStatus) => void;
  setSyncError: (owner: string, error: string) => void;
  activateOwner: (owner: string) => Promise<void>;
  addTransaction: (data: Omit<Transaction, 'id' | 'pocketId'>) => Promise<void>;
  importBankTransactions: (data: Transaction[], expectedOwner: string) => Promise<void>;
  deleteTransaction: (id: string) => Promise<void>;
  clearAllTransactions: () => Promise<void>;
  clearAllData: () => Promise<void>;
  createPocket: (data: NewPocket) => Promise<void>;
  depositToPocket: (id: string, amount: number) => Promise<void>;
  withdrawFromPocket: (id: string, amount: number) => Promise<void>;
  deletePocket: (id: string) => Promise<void>;
}
export const useFinanceStore = create<FinanceStore>((set, get) => {
  let cloud: ReturnType<typeof connectFinanceSession> | null = null;
  let refreshTask: Promise<boolean> | null = null;
  let refreshAgain = false;
  let busy = 0;
  function applyCloud(state: CloudFinanceState): void {
    set({ ...state.snapshot, cloudRevision: state.revision, migration: state.migration,
      pendingOperation: state.pending, isLoaded: true, error: null, lastSyncedAt: Date.now() });
  }
  async function cloudWork(work: (session: NonNullable<typeof cloud>) => Promise<CloudFinanceState>): Promise<void> {
    const session = cloud;
    const startedEpoch = epoch;
    if (!session) throw new Error('La cuenta no está conectada al servidor.');
    busy++;
    set({ isSyncing: true });
    try {
      const state = await work(session);
      if (startedEpoch === epoch && session === cloud) applyCloud(state);
    } catch (error: unknown) {
      if (startedEpoch === epoch && session === cloud) set({ pendingOperation: session.hasPending(),
        error: error instanceof Error ? error.message : 'No se pudo sincronizar el historial.' });
      throw error;
    } finally {
      if (startedEpoch === epoch && session === cloud) { busy = Math.max(0, busy - 1); set({ isSyncing: busy > 0 }); }
    }
  }
  function command(value: CloudCommand): Promise<void> { return cloudWork(session => session.run(value)); }
  async function mutate(transform: (snapshot: FinancialSnapshot) => FinancialSnapshot): Promise<void> {
    const { owner, isLoaded } = get();
    if (cloud) throw new Error('Las cuentas conectadas se modifican mediante comandos del servidor.');
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
    if (cloud) return command({ type: type === 'gasto' ? 'deposit' : 'withdraw', id, amount });
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
    syncMode: 'local', syncStatus: 'local', isSyncing: false, cloudRevision: null, migration: null, pendingOperation: false, lastSyncedAt: null,
    setSyncStatus: (owner, status) => { if (get().owner === owner && cloud) set({ syncStatus: status }); },
    setSyncError: (owner, error) => { if (get().owner === owner && cloud) set({ error }); },
    activateCloud: async (startEmpty = false) => {
      const session = cloud;
      const startedEpoch = epoch;
      try { await cloudWork(current => current.activate(startEmpty)); }
      catch (error: unknown) {
        // A rejected migration can mean another device changed its source. Refresh the
        // preview before the user confirms again; never silently switch the proposed source.
        if (session && session === cloud && startedEpoch === epoch && !session.hasPending()) {
          try { await cloudWork(current => current.refresh()); } catch { /* Visible store error is retained. */ }
          if (session === cloud && startedEpoch === epoch)
            set({ error: error instanceof Error ? error.message : 'Revisa el historial antes de volver a confirmar.' });
        }
        throw error;
      }
    },
    retryPending: () => cloudWork(session => session.retryPending()),
    refresh: () => {
      if (!cloud || !get().isLoaded) return Promise.resolve(false);
      refreshAgain = true;
      if (refreshTask) return refreshTask;
      const startedEpoch = epoch;
      const task = Promise.resolve().then(async () => {
        try {
          while (refreshAgain && startedEpoch === epoch && cloud) {
            refreshAgain = false;
            await cloudWork(session => session.refresh());
          }
          return startedEpoch === epoch && cloud !== null;
        } catch {
          // cloudWork exposes failures in the visible connection status.
          return false;
        }
        finally { if (startedEpoch === epoch) refreshTask = null; }
      });
      refreshTask = task;
      return task;
    },
    activateOwner: async owner => {
      if (get().owner === owner && get().isLoaded) return;
      const startedEpoch = ++epoch;
      cloud?.dispose();
      cloud = null;
      refreshTask = null; refreshAgain = false; busy = 0;
      const connected = !!financeApiUrl && owner.startsWith('user:');
      set({ ...emptySnapshot(), owner, isLoaded: false, error: null, hasLegacyData: false, migration: null, pendingOperation: false,
        syncMode: connected ? 'cloud' : 'local', syncStatus: connected ? 'connecting' : 'local', isSyncing: false, cloudRevision: null, lastSyncedAt: null });
      try {
        if (connected) {
          const session = connectFinanceSession(owner, AsyncStorage, localRepository.read, newId);
          cloud = session;
          const [state, hasLegacyData] = await Promise.all([session.load(), repository.hasLegacyData()]);
          if (startedEpoch === epoch && cloud === session) { applyCloud(state); set({ hasLegacyData }); }
          return;
        }
        const [snapshot, hasLegacyData] = await Promise.all([repository.read(owner), repository.hasLegacyData()]);
        if (startedEpoch === epoch) set({ ...snapshot, isLoaded: true, hasLegacyData });
      } catch (error: unknown) {
        if (startedEpoch === epoch) set({ error: error instanceof Error ? error.message : 'No se pudo cargar el historial. Vuelve a intentarlo.' });
      }
    },
    addTransaction: async data => {
      assertAmount(data.amount);
      if (!isCurrency(data.currency)) throw new Error('Selecciona DOP o USD.');
      if (data.category === 'ahorro') throw new Error('Usa la pantalla Ahorro para transferir dinero a tus bolsillos.');
      if (cloud) return command({ type: 'createMovement', data });
      await mutate(current => ({ ...current, transactions: [{ ...data, id: newId() }, ...current.transactions] }));
    },
    importBankTransactions: async (data, expectedOwner) => {
      if (get().owner !== expectedOwner || !expectedOwner.startsWith('user:')) throw new Error('La cuenta cambió durante la importación.');
      if (cloud) {
        if (get().migration || get().pendingOperation) throw new Error('Confirma la conexión o resuelve la operación pendiente antes de importar Gmail.');
        const existing = new Set(get().transactions.map(transaction => transaction.id));
        const missing = data.filter(transaction => !existing.has(transaction.id));
        if (!missing.length) return;
        const startedEpoch = epoch;
        for (let start = 0; start < missing.length; start += 1000) {
          if (epoch !== startedEpoch || get().owner !== expectedOwner) throw new Error('La cuenta cambió durante la importación.');
          await command({ type: 'importBankTransactions', data: missing.slice(start, start + 1000) });
        }
        return;
      }
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
      if (cloud) return command({ type: 'deleteMovement', id });
      await hideImported([transaction]);
      if (get().owner !== expectedOwner) throw new Error('La cuenta cambió.');
      await mutate(current => ({ ...current, transactions: current.transactions.filter(t => t.id !== id) }));
    },
    clearAllTransactions: async () => {
      if (cloud) return command({ type: 'clearTransactions' });
      if (get().pockets.some(p => p.currentAmount > 0)) throw new Error('Retira el dinero de tus bolsillos antes de borrar el historial.');
      const expectedOwner = get().owner;
      await hideImported(get().transactions);
      if (get().owner !== expectedOwner) throw new Error('La cuenta cambió.');
      await mutate(current => {
        if (current.pockets.some(p => p.currentAmount > 0)) throw new Error('Retira el dinero de los bolsillos antes de borrar.');
        return { ...current, transactions: [] };
      });
    },
    clearAllData: async () => {
      if (cloud) return command({ type: 'reset' });
      const expectedOwner = get().owner;
      await hideImported(get().transactions);
      if (get().owner !== expectedOwner) throw new Error('La cuenta cambió.');
      await mutate(() => emptySnapshot());
    },
    createPocket: async data => {
      assertAmount(data.targetAmount);
      if (!data.name.trim() || !isCurrency(data.currency)) throw new Error('Ingresa un nombre y una moneda para la meta.');
      if (cloud) return command({ type: 'createPocket', data });
      await mutate(current => ({ ...current, pockets: [{ id: newId(), name: data.name.trim(), targetAmount: data.targetAmount,
        currency: data.currency, emoji: data.emoji?.trim() || '🎯', currentAmount: 0, createdAt: new Date().toISOString() }, ...current.pockets] }));
    },
    depositToPocket: (id, amount) => transfer(id, amount, 'gasto'),
    withdrawFromPocket: (id, amount) => transfer(id, amount, 'ingreso'),
    deletePocket: async id => {
      if (cloud) return command({ type: 'closePocket', id });
      return mutate(current => {
      const pocket = current.pockets.find(p => p.id === id);
      if (!pocket) throw new Error('El bolsillo ya no existe.');
      const transactions: Transaction[] = pocket.currentAmount > 0 ? [{ id: newId(), currency: pocket.currency, amount: pocket.currentAmount,
        type: 'ingreso', category: 'ahorro', pocketId: id, date: new Date().toISOString(), note: 'Devolución por bolsillo eliminado: ' + pocket.name }, ...current.transactions] : current.transactions;
      return { ...current, transactions, pockets: current.pockets.filter(p => p.id !== id) };
      });
    },
  };
});
