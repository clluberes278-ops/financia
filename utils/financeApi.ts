import { supabase } from './supabase';

export const financeApiUrl = (process.env.FINANCIA_API_URL ?? '').replace(/\/$/, '');

export async function requestFinance(owner: string, method: 'GET' | 'PUT', body?: string): Promise<unknown> {
  if (!supabase) throw new Error('Inicia sesión para usar el servidor.');
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (!data.session || owner !== `user:${data.session.user.id}`) throw new Error('La cuenta cambió. Vuelve a intentarlo.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`${financeApiUrl}/api/finances`, {
      method, body, signal: controller.signal,
      headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' },
    });
    if (!response.ok) {
      if (response.status === 409) throw new Error('El historial cambió en otro dispositivo. Reintenta la operación.');
      if (response.status === 401) throw new Error('No se pudo validar tu sesión con el servidor. Vuelve a iniciar sesión.');
      throw new Error(`No se pudo guardar o consultar el historial (HTTP ${response.status}).`);
    }
    const result: unknown = await response.json();
    return result;
  } catch (error: unknown) {
    if (controller.signal.aborted) throw new Error('El servidor tardó demasiado. Comprueba la conexión y vuelve a intentarlo.');
    throw error;
  } finally { clearTimeout(timeout); }
}
