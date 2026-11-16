import { createFinanceClient } from '@financia/api-client';
import { supabase } from './supabase';
import { financeApiUrl, requestFinance } from './financeApi';
import { parseSnapshot, type FinancialStorage } from './financialRepository';
import type { FinancialSnapshot } from '../types/finance';
import { createCloudFinanceSession } from './cloudFinanceSession';

export async function financeAccessToken(owner: string): Promise<string> {
  if (!supabase) throw new Error('Inicia sesión para conectar tu cuenta.');
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error('No se pudo recuperar la sesión. Vuelve a iniciar sesión.');
  if (!data.session || owner !== `user:${data.session.user.id}`) throw new Error('La cuenta cambió. Vuelve a abrir su espacio.');
  return data.session.access_token;
}

export function connectFinanceSession(owner: string, storage: FinancialStorage,
  readLocal: (owner: string) => Promise<FinancialSnapshot>, newId: () => string) {
  const client = createFinanceClient({
    baseUrl: financeApiUrl, userId: owner.slice('user:'.length),
    getSession: async () => {
      const accessToken = await financeAccessToken(owner);
      return { userId: owner.slice('user:'.length), accessToken };
    },
  });
  return createCloudFinanceSession({
    owner, client, storage, readLocal, newId,
    readLegacy: async () => {
      const value = await requestFinance(owner, 'GET');
      if (!value || typeof value !== 'object' || !('revision' in value) || !('snapshot' in value)
        || typeof value.revision !== 'number' || !Number.isSafeInteger(value.revision) || value.revision < 0)
        throw new Error('El servidor devolvió una revisión anterior no válida. Se conservó el historial.');
      return { revision: value.revision, snapshot: parseSnapshot(JSON.stringify(value.snapshot)) };
    },
  });
}
