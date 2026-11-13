import { create } from 'zustand';
import type { Currency } from '../types/transaction';
interface CurrencyState { currency: Currency; setCurrency: (currency: Currency) => void }
export const useCurrencyStore = create<CurrencyState>(set => ({ currency: 'DOP', setCurrency: currency => set({ currency }) }));
