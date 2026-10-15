import { create } from 'zustand';
import { makeRedirectUri } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import type { Session, Subscription } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../utils/supabase';

WebBrowser.maybeCompleteAuthSession();

export type AuthProvider = 'google' | 'apple';

interface AuthState {
  session: Session | null;
  isLoading: boolean;
  isBusy: boolean;
  isConfigured: boolean;
  error: string | null;
  initialize: () => Promise<void>;
  signInWithProvider: (provider: AuthProvider) => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

let authSubscription: Subscription | null = null;

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  isLoading: true,
  isBusy: false,
  isConfigured: isSupabaseConfigured,
  error: null,

  initialize: async () => {
    if (!supabase) {
      set({ isLoading: false });
      return;
    }

    authSubscription?.unsubscribe();
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      set({ session, isLoading: false });
    });
    authSubscription = data.subscription;

    try {
      const { data: sessionData, error } = await supabase.auth.getSession();
      if (error) throw error;
      set({ session: sessionData.session, isLoading: false, error: null });
    } catch (error: unknown) {
      set({
        error: error instanceof Error ? error.message : 'No se pudo recuperar la sesión.',
        isLoading: false,
      });
    }
  },

  signInWithProvider: async (provider) => {
    if (!supabase) {
      set({ error: 'Configura las variables públicas de Supabase para habilitar el inicio de sesión.' });
      return;
    }

    set({ isBusy: true, error: null });
    try {
      const redirectTo =
        Platform.OS === 'web' && typeof window !== 'undefined'
          ? window.location.origin
          : makeRedirectUri({ scheme: 'financia', path: 'auth/callback' });
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
          skipBrowserRedirect: Platform.OS !== 'web',
        },
      });
      if (error) throw error;

      if (Platform.OS !== 'web') {
        if (!data.url) throw new Error('Supabase no devolvió la URL de autenticación.');

        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
        if (result.type === 'success') {
          const callbackUrl = new URL(result.url);
          const code = callbackUrl.searchParams.get('code');
          const callbackError =
            callbackUrl.searchParams.get('error_description') ?? callbackUrl.searchParams.get('error');
          if (callbackError) throw new Error(callbackError);
          if (!code) throw new Error('No se recibió el código de autorización.');

          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        }
      }
    } catch (error: unknown) {
      set({ error: error instanceof Error ? error.message : 'No se pudo iniciar sesión.' });
    } finally {
      set({ isBusy: false });
    }
  },

  signOut: async () => {
    if (!supabase) return;
    set({ isBusy: true, error: null });
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch (error: unknown) {
      set({ error: error instanceof Error ? error.message : 'No se pudo cerrar la sesión.' });
    } finally {
      set({ isBusy: false });
    }
  },

  clearError: () => set({ error: null }),
}));
