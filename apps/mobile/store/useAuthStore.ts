import { useFinanceStore } from './useFinanceStore';
import { create } from 'zustand';
import { Platform } from 'react-native';

import { getAuthRedirectUri, openAuthSession } from '../utils/authBrowser';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { FunctionsHttpError, type Session, type Subscription } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '../utils/supabase';
import { useGmailStore } from './useGmailStore';

const GMAIL_CONNECT_PENDING_KEY = '@financia_gmail_connect_pending';

export type AuthProvider = 'google' | 'apple';

interface AuthState {
  session: Session | null;
  isLoading: boolean;
  isBusy: boolean;
  isConfigured: boolean;
  error: string | null;
  initialize: () => Promise<void>;
  signInWithProvider: (provider: AuthProvider) => Promise<void>;
  connectGmail: () => Promise<void>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

let authSubscription: Subscription | null = null;

interface HttpResponseContext {
  status: number;
  text: () => Promise<string>;
  clone?: () => HttpResponseContext;
}

function isHttpResponseContext(value: unknown): value is HttpResponseContext {
  return (
    typeof value === 'object' &&
    value !== null &&
    'status' in value &&
    typeof value.status === 'number' &&
    'text' in value &&
    typeof value.text === 'function'
  );
}

async function getGmailConnectError(error: FunctionsHttpError): Promise<Error> {
  const response: unknown = error.context;
  if (!isHttpResponseContext(response)) return new Error(error.message);

  const responseBody = await (response.clone?.() ?? response).text();
  try {
    const payload: unknown = JSON.parse(responseBody);
    if (
      typeof payload === 'object' &&
      payload !== null &&
      'error' in payload &&
      typeof payload.error === 'string'
    ) {
      return new Error(payload.error);
    }
  } catch {
    return new Error(`La función de Gmail respondió con HTTP ${response.status} y un mensaje no legible.`);
  }

  return new Error(`La función de Gmail respondió con HTTP ${response.status} sin detallar el error.`);
}

async function saveGmailRefreshToken(refreshToken: string): Promise<void> {
  if (!supabase) throw new Error('Supabase no está configurado.');
  const { error } = await supabase.functions.invoke('gmail-connect', {
    body: { refreshToken },
  });
  if (error instanceof FunctionsHttpError) throw await getGmailConnectError(error);
  if (error) throw error;
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const activeSession = sessionData.session;
  if (activeSession?.provider_refresh_token) {
    const { error: clearProviderTokenError } = await supabase.auth.setSession({
      access_token: activeSession.access_token,
      refresh_token: activeSession.refresh_token,
    });
    if (clearProviderTokenError) throw clearProviderTokenError;
  }
  await AsyncStorage.removeItem(GMAIL_CONNECT_PENDING_KEY);
  await useGmailStore.getState().loadConnection();
  await useGmailStore.getState().loadImportedTransactions();
}

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
      const owner = session ? 'user:' + session.user.id : 'guest';
      if (useFinanceStore.getState().owner !== owner) {
        void useFinanceStore.getState().activateOwner(owner);
        useGmailStore.setState({ connection: null, error: null, isLoading: false });
      }
      set({ session, isLoading: false });
    });
    authSubscription = data.subscription;

    try {
      const { data: sessionData, error } = await supabase.auth.getSession();
      if (error) throw error;
      set({ session: sessionData.session, isLoading: false, error: null });

      const pendingGmailConnection = await AsyncStorage.getItem(GMAIL_CONNECT_PENDING_KEY);
      const refreshToken = sessionData.session?.provider_refresh_token;
      if (pendingGmailConnection === 'true' && refreshToken) {
        set({ isBusy: true });
        try {
          await saveGmailRefreshToken(refreshToken);
        } catch (connectionError: unknown) {
          await AsyncStorage.removeItem(GMAIL_CONNECT_PENDING_KEY);
          set({
            error: connectionError instanceof Error ? connectionError.message : 'No se pudo conectar Gmail.',
          });
        } finally {
          set({ isBusy: false });
        }
      } else if (pendingGmailConnection === 'true') {
        await AsyncStorage.removeItem(GMAIL_CONNECT_PENDING_KEY);
        set({ error: 'Google no entregó autorización permanente para Gmail. Intenta conectar Gmail otra vez.' });
      }
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
      const redirectTo = getAuthRedirectUri();
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

        const result = await openAuthSession(data.url, redirectTo);
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

  connectGmail: async () => {
    if (!supabase) {
      set({ error: 'Configura Supabase para conectar Gmail.' });
      return;
    }

    set({ isBusy: true, error: null });
    let webRedirectStarted = false;
    try {
      const redirectTo = getAuthRedirectUri();
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          scopes: 'openid email profile https://www.googleapis.com/auth/gmail.readonly',
          queryParams: { access_type: 'offline', prompt: 'consent' },
          skipBrowserRedirect: true,
        },
      });
      if (error) throw error;
      if (!data.url) throw new Error('Supabase no devolvió la URL para autorizar Gmail.');

      if (Platform.OS === 'web') {
        await AsyncStorage.setItem(GMAIL_CONNECT_PENDING_KEY, 'true');
        webRedirectStarted = true;
        window.location.assign(data.url);
        return;
      }

      const result = await openAuthSession(data.url, redirectTo);
      if (result.type !== 'success') return;

      const callbackUrl = new URL(result.url);
      const code = callbackUrl.searchParams.get('code');
      const callbackError =
        callbackUrl.searchParams.get('error_description') ?? callbackUrl.searchParams.get('error');
      if (callbackError) throw new Error(callbackError);
      if (!code) throw new Error('No se recibió el código para autorizar Gmail.');

      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
      if (exchangeError) throw exchangeError;
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const refreshToken = sessionData.session?.provider_refresh_token;
      if (!refreshToken) throw new Error('Google no entregó autorización permanente para Gmail. Intenta conectar Gmail otra vez.');

      await saveGmailRefreshToken(refreshToken);
    } catch (error: unknown) {
      if (webRedirectStarted) await AsyncStorage.removeItem(GMAIL_CONNECT_PENDING_KEY);
      set({ error: error instanceof Error ? error.message : 'No se pudo conectar Gmail.' });
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
