import { HubConnectionBuilder, LogLevel, type HubConnection } from '@microsoft/signalr';

export type FinanceRealtimeStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline';

export interface FinanceRealtimeOptions {
  baseUrl: string;
  getAccessToken: () => Promise<string>;
  onChange: () => void;
  onStatus: (status: FinanceRealtimeStatus) => void;
  onError: (message: string) => void;
}

const MAX_REVISION = 9223372036854775807n;
const RETRY_DELAY_MS = 15000;
const EVENT_HISTORY_LIMIT = 256;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Notify the account-bound owner to refresh; financial data is always read through the API. */
export function startFinanceRealtime(options: FinanceRealtimeOptions): () => void {
  let stopped = false;
  let starting = false;
  let generation = 0;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let connection: HubConnection | undefined;
  let highestRevision = -1n;
  const eventHistory = new Set<string>();

  const status = (value: FinanceRealtimeStatus): void => { if (!stopped) options.onStatus(value); };
  const error = (message: string): void => { if (!stopped) options.onError(message); };
  const changed = (): void => {
    if (stopped) return;
    try { options.onChange(); }
    catch { error('No se pudo solicitar la actualización del historial. Vuelve a intentarlo.'); }
  };
  const clearRetry = (): void => {
    if (retry !== undefined) clearTimeout(retry);
    retry = undefined;
  };

  function scheduleRetry(): void {
    if (stopped || retry !== undefined) return;
    retry = setTimeout(() => {
      retry = undefined;
      if (stopped) return;
      if (starting) scheduleRetry();
      else void start();
    }, RETRY_DELAY_MS);
  }

  async function start(): Promise<void> {
    if (stopped || starting || !connection) return;
    starting = true;
    const attempt = ++generation;
    status('connecting');
    try {
      await connection.start();
      if (stopped || attempt !== generation) return;
      clearRetry();
      status('connected');
      // Subscribe before this read so changes racing with initial loading are recovered too.
      changed();
    } catch {
      if (stopped || attempt !== generation) return;
      status('offline');
      error('No se pudo conectar a las actualizaciones del historial. Se volverá a intentar automáticamente.');
      scheduleRetry();
    } finally { starting = false; }
  }

  function onChange(payload: unknown): void {
    if (stopped) return;
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)
      || !('eventId' in payload) || typeof payload.eventId !== 'string' || !UUID.test(payload.eventId)
      || !('revision' in payload) || typeof payload.revision !== 'string' || payload.revision.length > 19
      || !/^(0|[1-9]\d*)$/.test(payload.revision)) {
      error('Se recibió una notificación de historial inválida. Actualiza el historial para recuperar sus datos.');
      return;
    }
    const revision = BigInt(payload.revision);
    if (revision > MAX_REVISION) {
      error('Se recibió una revisión de historial fuera del rango admitido. Actualiza el historial.');
      return;
    }
    const eventId = payload.eventId.toLowerCase();
    if (revision <= highestRevision || eventHistory.has(eventId)) return;
    highestRevision = revision;
    eventHistory.add(eventId);
    if (eventHistory.size > EVENT_HISTORY_LIMIT) {
      const oldest = eventHistory.values().next().value;
      if (oldest !== undefined) eventHistory.delete(oldest);
    }
    changed();
  }

  try {
    connection = new HubConnectionBuilder()
      .withUrl(options.baseUrl.replace(/\/+$/, '') + '/hubs/finances', {
        accessTokenFactory: async () => {
          if (stopped) throw new Error('La sincronización de esta cuenta se cerró.');
          const token = await options.getAccessToken();
          if (stopped || !token.trim()) throw new Error('No hay una sesión activa para sincronizar.');
          return token;
        },
        withCredentials: false,
      })
      .withAutomaticReconnect([0, 1000, 5000, 15000])
      .configureLogging(LogLevel.None)
      .build();
    connection.on('FinanceChanged', onChange);
    connection.onreconnecting(() => {
      if (stopped) return;
      generation++;
      clearRetry();
      status('reconnecting');
    });
    connection.onreconnected(() => {
      if (stopped) return;
      clearRetry();
      status('connected');
      // Event delivery is not durable: always recover the server state after reconnecting.
      changed();
    });
    connection.onclose(() => {
      if (stopped) return;
      generation++;
      status('offline');
      error('Se interrumpió la sincronización del historial. Se volverá a intentar automáticamente.');
      scheduleRetry();
    });
    void start();
  } catch {
    status('offline');
    error('No se pudo preparar la sincronización del historial. Revisa la configuración del servidor.');
  }

  return () => {
    if (stopped) return;
    stopped = true;
    generation++;
    clearRetry();
    connection?.off('FinanceChanged', onChange);
    // The owner of these callbacks has already gone away; no late UI updates on stop failures.
    try { void connection?.stop().catch(() => undefined); }
    catch { /* A synchronously failing transport must not escape account cleanup. */ }
  };
}
