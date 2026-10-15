import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@financia_settings';

export type AppLanguage = 'es' | 'en';
export type AppTheme = 'light' | 'dark';

export interface SettingsState {
  language: AppLanguage;
  theme: AppTheme;
  accentColor: string;
  hideBalanceByDefault: boolean;
  notificationsEnabled: boolean;
  biometricLockEnabled: boolean;
  isLoaded: boolean;
  loadSettings: () => Promise<void>;
  setLanguage: (language: AppLanguage) => Promise<void>;
  setTheme: (theme: AppTheme) => Promise<void>;
  setAccentColor: (accentColor: string) => Promise<void>;
  setHideBalanceByDefault: (value: boolean) => Promise<void>;
  setNotificationsEnabled: (value: boolean) => Promise<void>;
  setBiometricLockEnabled: (value: boolean) => Promise<void>;
}

type StoredSettings = Pick<
  SettingsState,
  'language' | 'theme' | 'accentColor' | 'hideBalanceByDefault' | 'notificationsEnabled' | 'biometricLockEnabled'
>;

const DEFAULT_SETTINGS: StoredSettings = {
  language: 'es',
  theme: 'light',
  accentColor: '#4F46E5',
  hideBalanceByDefault: false,
  notificationsEnabled: true,
  biometricLockEnabled: false,
};

async function persist(settings: StoredSettings) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...DEFAULT_SETTINGS,
  isLoaded: false,
  loadSettings: async () => {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const stored = raw ? (JSON.parse(raw) as Partial<StoredSettings>) : {};
    set({ ...DEFAULT_SETTINGS, ...stored, isLoaded: true });
  },
  setLanguage: async (language) => {
    set({ language });
    await persist({ ...get(), language });
  },
  setTheme: async (theme) => {
    set({ theme });
    await persist({ ...get(), theme });
  },
  setAccentColor: async (accentColor) => {
    set({ accentColor });
    await persist({ ...get(), accentColor });
  },
  setHideBalanceByDefault: async (hideBalanceByDefault) => {
    set({ hideBalanceByDefault });
    await persist({ ...get(), hideBalanceByDefault });
  },
  setNotificationsEnabled: async (notificationsEnabled) => {
    set({ notificationsEnabled });
    await persist({ ...get(), notificationsEnabled });
  },
  setBiometricLockEnabled: async (biometricLockEnabled) => {
    set({ biometricLockEnabled });
    await persist({ ...get(), biometricLockEnabled });
  },
}));