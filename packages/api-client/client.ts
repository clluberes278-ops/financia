import { operations } from './generated/models';
import type {
  V2FinanceResponse, ImportLegacyRequest, CreateMovementRequest, UpdateMovementRequest,
  CreateMovementResponse, DeleteMovementResponse, CreatePocketRequest, EditPocketRequest,
  PocketTransferRequest, ClosePocketRequest, PocketResponse, PocketTransferResponse,
  FinanceRevisionRequest, FinanceCollectionResponse, BankImportRequest, BankImportResponse,
} from './generated/models';
import { validateResponse } from './validation';

export type FinanceApiErrorKind = 'unauthorized' | 'forbidden' | 'not_found' | 'conflict' | 'validation'
  | 'server' | 'network' | 'timeout' | 'cancelled' | 'session_changed' | 'invalid_response' | 'configuration';
export class FinanceApiError extends Error {
  constructor(public readonly kind: FinanceApiErrorKind, message: string,
    public readonly status?: number, public readonly outcomeUnknown = false) {
    super(message);
    this.name = 'FinanceApiError';
  }
}
export interface FinanceSession { userId: string; accessToken: string }
export interface FinanceClientOptions {
  baseUrl: string;
  userId: string;
  getSession: () => Promise<FinanceSession | null>;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}
export interface ReadOptions { signal?: AbortSignal }
export interface WriteOptions extends ReadOptions { idempotencyKey: string }

function baseAddress(value: string): string {
  try {
    const url = new URL(value);
    const local = ['localhost', '127.0.0.1', '[::1]', '10.0.2.2'].includes(url.hostname);
    if (url.username || url.password || url.href.includes('?') || url.href.includes('#') || (url.protocol !== 'https:' && !(url.protocol === 'http:' && local))) throw new Error();
    return url.href.replace(/\/+$/, '');
  } catch {
    throw new FinanceApiError('configuration', 'Configura una URL HTTPS para la API, sin credenciales ni parámetros. HTTP solo se admite en desarrollo local.');
  }
}

export function createFinanceClient(options: FinanceClientOptions) {
  const baseUrl = baseAddress(options.baseUrl);
  if (!options.userId.trim()) throw new FinanceApiError('configuration', 'Selecciona el usuario de este cliente.');
  const fetcher = options.fetch ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? 20000;
  if (!fetcher || !Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2147483647)
    throw new FinanceApiError('configuration', 'La conexión o su tiempo de espera no son válidos.');
  const userId = options.userId;
  const active = new Map<AbortController, () => void>();
  let disposed = false;

  async function perform<T>(operationId: keyof typeof operations, body: unknown, params: Record<string, string>, requestOptions: ReadOptions | WriteOptions = {}): Promise<T> {
    const operation = operations[operationId];
    const isWrite = operation.method !== 'GET';
    const idempotencyKey = 'idempotencyKey' in requestOptions ? requestOptions.idempotencyKey : undefined;
    const signal = requestOptions.signal;
    if (disposed) throw new FinanceApiError('session_changed', 'La sesión de este cliente ya se cerró.');
    if (isWrite && (typeof idempotencyKey !== 'string'
      || !idempotencyKey.trim() || idempotencyKey.length > 128 || idempotencyKey.trim() !== idempotencyKey))
      throw new FinanceApiError('validation', 'Cada operación requiere una clave de idempotencia estable de hasta 128 caracteres.');
    // Capture content before the first await; UI edits cannot mutate an in-flight command.
    let serialized: string | undefined;
    try { serialized = body === undefined ? undefined : JSON.stringify(body); }
    catch { throw new FinanceApiError('validation', 'Los datos de la operación no se pueden convertir a JSON.'); }
    let path: string = operation.path;
    for (const [key, value] of Object.entries(params)) {
      if (typeof value !== 'string' || !value.trim()) throw new FinanceApiError('validation', 'El identificador y la versión deben ser válidos.');
      if (key === 'expectedVersion') continue;
      path = path.replace(`{${key}}`, encodeURIComponent(value));
    }
    if (params.expectedVersion !== undefined) {
      if (!/^[0-9]+$/.test(params.expectedVersion) || BigInt(params.expectedVersion) <= 0n || BigInt(params.expectedVersion) > 9223372036854775807n)
        throw new FinanceApiError('validation', 'expectedVersion debe ser un entero positivo válido.');
      path += `?expectedVersion=${encodeURIComponent(params.expectedVersion)}`;
    }
    const controller = new AbortController();
    let sent = false;
    let abortKind: 'cancelled' | 'timeout' | 'session_changed' = 'cancelled';
    let rejectAborted: (reason: FinanceApiError) => void = () => {};
    const aborted = new Promise<never>((_resolve, reject) => { rejectAborted = reject; });
    const abort = (kind: typeof abortKind) => {
      if (controller.signal.aborted) return;
      abortKind = kind;
      controller.abort();
      const message = kind === 'session_changed' ? 'La cuenta cambió. Vuelve a abrir su espacio financiero.'
        : kind === 'timeout' ? 'La API tardó demasiado. Verifica la conexión antes de reintentar.' : 'La solicitud fue cancelada.';
      rejectAborted(new FinanceApiError(kind, message, undefined, isWrite && sent));
    };
    const cancel = () => abort('cancelled');
    active.set(controller, () => abort('session_changed'));
    signal?.addEventListener('abort', cancel, { once: true });
    const timer = setTimeout(() => abort('timeout'), timeoutMs);
    if (signal?.aborted) cancel();

    const ensureSession = async () => {
      let session: FinanceSession | null;
      try { session = await options.getSession(); }
      catch { throw new FinanceApiError('unauthorized', 'No se pudo recuperar la sesión.', undefined, isWrite && sent); }
      if (controller.signal.aborted) throw new FinanceApiError(abortKind, 'La solicitud ya no está activa.', undefined, isWrite && sent);
      if (disposed || !session || session.userId !== userId || !session.accessToken?.trim())
        throw new FinanceApiError('session_changed', 'La cuenta cambió o la sesión se cerró.', undefined, isWrite && sent);
      return session;
    };
    const task = async (): Promise<T> => {
      if (controller.signal.aborted) throw new FinanceApiError(abortKind, 'La solicitud ya no está activa.');
      const session = await ensureSession();
      const headers: Record<string, string> = { Accept: 'application/json', Authorization: `Bearer ${session.accessToken}` };
      if (serialized !== undefined) headers['Content-Type'] = 'application/json';
      if (idempotencyKey !== undefined) headers['Idempotency-Key'] = idempotencyKey;
      sent = true;
      let response: Response;
      try {
        response = await fetcher(baseUrl + path, { method: operation.method, body: serialized, headers, signal: controller.signal, redirect: 'error', credentials: 'omit', cache: 'no-store' });
      } catch {
        throw new FinanceApiError('network', 'No se pudo contactar con la API. Reintenta con la misma clave si era una escritura.', undefined, isWrite);
      }
      // Never return information obtained under a session that has since changed.
      await ensureSession();
      let payload: unknown;
      try { payload = await response.json(); }
      catch { payload = undefined; }
      await ensureSession();
      if (!response.ok) {
        const status = response.status;
        const kind: FinanceApiErrorKind = status === 401 ? 'unauthorized' : status === 403 ? 'forbidden' : status === 404 ? 'not_found'
          : status === 409 ? 'conflict' : status === 400 ? 'validation' : 'server';
        const detail = payload !== null && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string' ? payload.error.slice(0, 500) : undefined;
        const message = kind === 'unauthorized' ? 'Tu sesión no es válida. Vuelve a iniciar sesión.'
          : kind === 'conflict' ? detail ?? 'Los datos cambiaron. Recarga antes de reintentar.'
          : kind === 'validation' || kind === 'not_found' ? detail ?? 'La solicitud o el registro no son válidos.'
          : kind === 'forbidden' ? 'No tienes acceso a esta operación.' : 'La API no pudo completar la solicitud.';
        throw new FinanceApiError(kind, message, status, isWrite && status >= 500);
      }
      if (response.redirected || response.status !== operation.status || !validateResponse(operation.responseSchema, payload))
        throw new FinanceApiError('invalid_response', 'La API devolvió datos con un formato no válido. No se modificó el estado local.', response.status, isWrite);
      return payload as T;
    };
    try { return await Promise.race([task(), aborted]); }
    finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', cancel);
      active.delete(controller);
    }
  }

  return {
    getFinances: (read: ReadOptions = {}) => perform<V2FinanceResponse>('getFinances', undefined, {}, read),
    importLegacy: (request: ImportLegacyRequest, write: WriteOptions) => perform<V2FinanceResponse>('importLegacy', request, {}, write),
    createMovement: (request: CreateMovementRequest, write: WriteOptions) => perform<CreateMovementResponse>('createMovement', request, {}, write),
    updateMovement: (id: string, request: UpdateMovementRequest, write: WriteOptions) => perform<CreateMovementResponse>('updateMovement', request, { id }, write),
    deleteMovement: (id: string, expectedVersion: string, write: WriteOptions) => perform<DeleteMovementResponse>('deleteMovement', undefined, { id, expectedVersion }, write),
    createPocket: (request: CreatePocketRequest, write: WriteOptions) => perform<PocketResponse>('createPocket', request, {}, write),
    editPocket: (id: string, request: EditPocketRequest, write: WriteOptions) => perform<PocketResponse>('editPocket', request, { id }, write),
    depositToPocket: (id: string, request: PocketTransferRequest, write: WriteOptions) => perform<PocketTransferResponse>('depositToPocket', request, { id }, write),
    withdrawFromPocket: (id: string, request: PocketTransferRequest, write: WriteOptions) => perform<PocketTransferResponse>('withdrawFromPocket', request, { id }, write),
    closePocket: (id: string, request: ClosePocketRequest, write: WriteOptions) => perform<PocketTransferResponse>('closePocket', request, { id }, write),
    clearTransactions: (request: FinanceRevisionRequest, write: WriteOptions) => perform<FinanceCollectionResponse>('clearTransactions', request, {}, write),
    resetFinances: (request: FinanceRevisionRequest, write: WriteOptions) => perform<FinanceCollectionResponse>('resetFinances', request, {}, write),
    importBankTransactions: (request: BankImportRequest, write: WriteOptions) => perform<BankImportResponse>('importBankTransactions', request, {}, write),
    dispose: () => { disposed = true; for (const cancel of active.values()) cancel(); active.clear(); },
  };
}
