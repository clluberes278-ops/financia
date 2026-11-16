import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = '@financia_settings';

export type AppLanguage = 'es' | 'en';
export type AppTheme = 'light' | 'dark';
export type AppFontFamily = 'system' | 'serif' | 'rounded' | 'monospace';
export type CardColor = 'violet' | 'pink' | 'blue' | 'teal' | 'orange' | 'slate';

export interface SettingsState {
  language: AppLanguage;
  theme: AppTheme;
  accentColor: string;
  cardColor: CardColor;
  fontFamily: AppFontFamily;
  hideBalanceByDefault: boolean;
  notificationsEnabled: boolean;
  isLoaded: boolean;
  loadSettings: () => Promise<void>;
  setLanguage: (language: AppLanguage) => Promise<void>;
  setTheme: (theme: AppTheme) => Promise<void>;
  setAccentColor: (accentColor: string) => Promise<void>;
  setCardColor: (color: CardColor) => Promise<void>;
  setFontFamily: (fontFamily: AppFontFamily) => Promise<void>;
  setHideBalanceByDefault: (value: boolean) => Promise<void>;
  setNotificationsEnabled: (value: boolean) => Promise<void>;
}

type StoredSettings = Pick<
  SettingsState,
  | 'language'
  | 'theme'
  | 'accentColor'
  | 'cardColor'
  | 'fontFamily'
  | 'hideBalanceByDefault'
  | 'notificationsEnabled'
>;

const DEFAULT_SETTINGS: StoredSettings = {
  language: 'es',
  theme: 'light',
  accentColor: '#8B5CF6',
  cardColor: 'violet',
  fontFamily: 'system',
  hideBalanceByDefault: false,
  notificationsEnabled: true,
};

async function persist(settings: StoredSettings) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  ...DEFAULT_SETTINGS,
  isLoaded: false,
  loadSettings: async () => {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const stored = raw
      ? (JSON.parse(raw) as Partial<StoredSettings> & {
          balanceCardColor?: CardColor;
          biometricLockEnabled?: boolean;
        })
      : {};
    if (!stored.cardColor && stored.balanceCardColor) {
      stored.cardColor = stored.balanceCardColor;
    }
    delete stored.balanceCardColor;
    delete stored.biometricLockEnabled;
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
  setCardColor: async (cardColor) => {
    set({ cardColor });
    await persist({ ...get(), cardColor });
  },
  setFontFamily: async (fontFamily) => {
    set({ fontFamily });
    await persist({ ...get(), fontFamily });
  },
  setHideBalanceByDefault: async (hideBalanceByDefault) => {
    set({ hideBalanceByDefault });
    await persist({ ...get(), hideBalanceByDefault });
  },
  setNotificationsEnabled: async (notificationsEnabled) => {
    set({ notificationsEnabled });
    await persist({ ...get(), notificationsEnabled });
  },
}));