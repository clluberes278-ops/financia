import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SavingsPocket } from '../types/savings';

const STORAGE_KEY = '@financia_savings_pockets';

interface SavingsStore {
  pockets: SavingsPocket[];
  isLoaded: boolean;
  loadPockets: () => Promise<void>;
  createPocket: (data: { name: string; targetAmount: number; emoji?: string }) => Promise<void>;
  depositToPocket: (id: string, amount: number) => Promise<void>;
  withdrawFromPocket: (id: string, amount: number) => Promise<void>;
  deletePocket: (id: string) => Promise<void>;
}

async function persist(pockets: SavingsPocket[]) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(pockets));
}

export const useSavingsStore = create<SavingsStore>((set, get) => ({
  pockets: [],
  isLoaded: false,

  loadPockets: async () => {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    set({ pockets: raw ? JSON.parse(raw) : [], isLoaded: true });
  },

  createPocket: async ({ name, targetAmount, emoji = '🎯' }) => {
    const newPocket: SavingsPocket = {
      id: Date.now().toString(),
      name: name.trim(),
      targetAmount,
      currentAmount: 0,
      emoji: emoji.trim() || '🎯',
      createdAt: new Date().toISOString(),
    };
    const updated = [newPocket, ...get().pockets];
    set({ pockets: updated });
    await persist(updated);
  },

  depositToPocket: async (id: string, amount: number) => {
    if (amount <= 0) return;
    const updated = get().pockets.map((p) => {
      if (p.id === id) {
        return { ...p, currentAmount: p.currentAmount + amount };
      }
      return p;
    });
    set({ pockets: updated });
    await persist(updated);
  },

  withdrawFromPocket: async (id: string, amount: number) => {
    if (amount <= 0) return;
    const updated = get().pockets.map((p) => {
      if (p.id === id) {
        return { ...p, currentAmount: Math.max(0, p.currentAmount - amount) };
      }
      return p;
    });
    set({ pockets: updated });
    await persist(updated);
  },

  deletePocket: async (id: string) => {
    const updated = get().pockets.filter((p) => p.id !== id);
    set({ pockets: updated });
    await persist(updated);
  },
}));
