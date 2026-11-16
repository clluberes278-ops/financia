import {
  FinanceApiError, validateResponse, type createFinanceClient,
  type V2FinanceResponse, type ImportLegacyRequest, type CreateMovementRequest, type CreatePocketRequest,
  type PocketTransferRequest, type ClosePocketRequest, type FinanceRevisionRequest, type BankImportRequest,
} from '@financia/api-client';
import { emptySnapshot, type FinancialSnapshot, type NewPocket } from '../types/finance';
import type { Transaction } from '../types/transaction';
import { assertAmount, parseSnapshot, type FinancialStorage } from './financialRepository';

export interface MigrationInfo {
  source: 'server' | 'local' | 'empty';
  transactionCount: number;
  pocketCount: number;
}
export interface CloudFinanceState {
  snapshot: FinancialSnapshot;
  revision: string;
  migration: MigrationInfo | null;
  pending: boolean;
}
export type CloudCommand =
  | { type: 'createMovement'; data: Omit<Transaction, 'id' | 'pocketId'> }
  | { type: 'deleteMovement'; id: string }
  | { type: 'createPocket'; data: NewPocket }
  | { type: 'deposit' | 'withdraw'; id: string; amount: number }
  | { type: 'closePocket'; id: string }
  | { type: 'clearTransactions' | 'reset' }
  | { type: 'importBankTransactions'; data: Transaction[] };

type Client = ReturnType<typeof createFinanceClient>;
interface Options {
  owner: string;
  client: Client;
  storage: FinancialStorage;
  readLocal: (owner: string) => Promise<FinancialSnapshot>;
  readLegacy: () => Promise<{ revision: number; snapshot: FinancialSnapshot }>;
  newId: () => string;
}
type StoredCommand =
  | { method: 'importLegacy'; request: ImportLegacyRequest }
  | { method: 'createMovement'; request: CreateMovementRequest }
  | { method: 'deleteMovement'; id: string; expectedVersion: string }
  | { method: 'createPocket'; request: CreatePocketRequest }
  | { method: 'depositToPocket' | 'withdrawFromPocket'; id: string; request: PocketTransferRequest }
  | { method: 'closePocket'; id: string; request: ClosePocketRequest }
  | { method: 'clearTransactions' | 'resetFinances'; request: FinanceRevisionRequest }
  | { method: 'importBankTransactions'; request: BankImportRequest };
interface PendingCommand { version: 1; owner: string; key: string; command: StoredCommand }
interface Candidate { info: MigrationInfo; request: ImportLegacyRequest }
const MAX_REVISION = 9223372036854775807n;
const MAX_CENTS = 99999999999999n;
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= 256;
const ownKeys = (value: Record<string, unknown>, keys: string[]): boolean => Object.keys(value).every(key => keys.includes(key));

function revision(value: unknown, allowZero = false): value is string {
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]*)$/.test(value)) return false;
  const number = BigInt(value);
  return number >= (allowZero ? 0n : 1n) && number <= MAX_REVISION;
}

function invalid(message: string): FinanceApiError { return new FinanceApiError('validation', message); }
function invalidResponse(): FinanceApiError { return new FinanceApiError('invalid_response', 'El servidor devolvió importes o un historial no válidos. Se conserva el estado confirmado.'); }

function decimal(value: number): string {
  assertAmount(value);
  return value.toFixed(2);
}

function numericMoney(value: string, allowZero = false): number {
  if (!/^[0-9]+(?:\.[0-9]{1,2})?$/.test(value)) throw invalidResponse();
  const [whole, fraction = ''] = value.split('.');
  const cents = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (cents < (allowZero ? 0n : 1n) || cents > MAX_CENTS) throw invalidResponse();
  const number = Number(cents) / 100;
  const canonical = `${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`;
  if (!Number.isFinite(number) || number.toFixed(2) !== canonical) throw invalidResponse();
  return number;
}

function convert(value: unknown): { response: V2FinanceResponse; snapshot: FinancialSnapshot } {
  if (!validateResponse('V2FinanceResponse', value)) throw invalidResponse();
  // The SDK contract is validated before these assertions; string revisions never pass through Number.
  const response = value as V2FinanceResponse;
  if (!revision(response.revision, true)) throw invalidResponse();
  const transactions: Transaction[] = response.snapshot.transactions.map(movement => {
    if (!revision(movement.version)) throw invalidResponse();
    return {
      id: movement.id, currency: movement.currency, amount: numericMoney(movement.amount), type: movement.type,
      category: movement.category, date: movement.date,
      ...(movement.note === undefined ? {} : { note: movement.note }),
      ...(movement.pocketId === undefined ? {} : { pocketId: movement.pocketId }),
    };
  });
  const pockets = response.snapshot.pockets.map(pocket => {
    if (!revision(pocket.version)) throw invalidResponse();
    return {
      id: pocket.id, name: pocket.name, currency: pocket.currency, targetAmount: numericMoney(pocket.targetAmount),
      currentAmount: numericMoney(pocket.currentAmount, true), emoji: pocket.emoji, createdAt: pocket.createdAt,
      ...(pocket.color === undefined ? {} : { color: pocket.color }),
    };
  });
  if (new Set(transactions.map(movement => movement.id)).size !== transactions.length
    || new Set(pockets.map(pocket => pocket.id)).size !== pockets.length) throw invalidResponse();
  if (response.revision === '0' && (transactions.length || pockets.length)) throw invalidResponse();
  // References to closed, historical pockets remain valid even when that pocket is absent from the active snapshot.
  const pocketsById = new Map(pockets.map(pocket => [pocket.id, pocket]));
  for (const movement of transactions) {
    const pocket = movement.pocketId === undefined ? undefined : pocketsById.get(movement.pocketId);
    if (pocket && pocket.currency !== movement.currency) throw invalidResponse();
  }
  return { response, snapshot: { version: 1, transactions, pockets } };
}

function validStoredCommand(value: unknown): value is StoredCommand {
  if (!object(value) || !Object.hasOwn(value, 'method') || typeof value.method !== 'string') return false;
  if (value.method === 'deleteMovement') return ownKeys(value, ['method', 'id', 'expectedVersion'])
    && Object.hasOwn(value, 'id') && Object.hasOwn(value, 'expectedVersion') && id(value.id) && revision(value.expectedVersion);
  const schemas: Record<string, string> = {
    importLegacy: 'ImportLegacyRequest', createMovement: 'CreateMovementRequest', createPocket: 'CreatePocketRequest',
    depositToPocket: 'PocketTransferRequest', withdrawFromPocket: 'PocketTransferRequest', closePocket: 'ClosePocketRequest',
    clearTransactions: 'FinanceRevisionRequest', resetFinances: 'FinanceRevisionRequest', importBankTransactions: 'BankImportRequest',
  };
  if (!Object.hasOwn(schemas, value.method)) return false;
  const needsId = ['depositToPocket', 'withdrawFromPocket', 'closePocket'].includes(value.method);
  if (!ownKeys(value, needsId ? ['method', 'id', 'request'] : ['method', 'request'])
    || (needsId && (!Object.hasOwn(value, 'id') || !id(value.id))) || !Object.hasOwn(value, 'request') || !validateResponse(schemas[value.method]!, value.request)) return false;
  if (object(value.request) && Object.hasOwn(value.request, 'expectedVersion') && !revision(value.request.expectedVersion)) return false;
  if (object(value.request) && value.method !== 'importLegacy' && Object.hasOwn(value.request, 'expectedRevision') && !revision(value.request.expectedRevision)) return false;
  if (value.method === 'importLegacy') {
    if (!object(value.request)) return false;
    const { snapshot, legacyRevision } = value.request;
    if (snapshot !== undefined && snapshot !== null) return legacyRevision === undefined || legacyRevision === null;
    return revision(legacyRevision);
  }
  return true;
}

function parsePending(raw: string, owner: string): PendingCommand {
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw invalid('La operación pendiente no se puede leer. Se conserva para recuperarla; no se enviará otra operación.'); }
  if (!object(value) || !ownKeys(value, ['version', 'owner', 'key', 'command'])
    || !['version', 'owner', 'key', 'command'].every(key => Object.hasOwn(value, key)) || value.version !== 1 || value.owner !== owner
    || typeof value.key !== 'string' || !value.key.trim() || value.key.trim() !== value.key || value.key.length > 128
    || !validStoredCommand(value.command)) throw invalid('La operación pendiente no corresponde a esta cuenta o tiene un formato inválido. Se conserva intacta.');
  return { version: 1, owner, key: value.key, command: value.command };
}

/** Owns one authenticated account and its durable, at-most-one pending write. No local/cloud fallback. */
export function createCloudFinanceSession(options: Options) {
  const { owner, client, storage } = options;
  if (!owner.startsWith('user:') || owner.length <= 5) throw invalid('La sesión remota requiere una cuenta autenticada.');
  const pendingKey = '@financia_pending_v2:' + encodeURIComponent(owner);
  let pending: PendingCommand | null = null;
  let pendingRead = false;
  let invalidPending = false;
  let candidate: Candidate | null = null;
  let current: V2FinanceResponse | null = null;
  let disposed = false;
  let queue: Promise<unknown> = Promise.resolve();
  const active = () => { if (disposed) throw new FinanceApiError('session_changed', 'Esta sesión ya se cerró.'); };
  const hasPending = () => pending !== null || invalidPending;
  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    const next = queue.then(async () => { active(); return work(); });
    queue = next.catch(() => undefined);
    return next;
  }
  async function restorePending(): Promise<void> {
    if (pendingRead) return;
    const raw = await storage.getItem(pendingKey);
    active();
    if (raw) {
      invalidPending = true;
      pending = parsePending(raw, owner);
      invalidPending = false;
    }
    pendingRead = true;
  }
  function state(): CloudFinanceState {
    return {
      snapshot: current && current.revision !== '0' ? convert(current).snapshot : emptySnapshot(),
      revision: current?.revision ?? '0', migration: candidate ? { ...candidate.info } : null, pending: hasPending(),
    };
  }
  async function readCurrent(): Promise<V2FinanceResponse> {
    const fetched: unknown = await client.getFinances();
    active();
    // Copy the validated response so a caller or injected transport cannot mutate cached entity versions.
    const checked = convert(fetched);
    if (current && BigInt(checked.response.revision) < BigInt(current.revision)) throw invalidResponse();
    const clone: unknown = JSON.parse(JSON.stringify(fetched));
    return convert(clone).response;
  }
  async function chooseCandidate(): Promise<Candidate> {
    const legacy = await options.readLegacy();
    active();
    if (!Number.isSafeInteger(legacy.revision) || legacy.revision < 0) throw invalidResponse();
    const snapshot = legacy.revision > 0 ? legacy.snapshot : await options.readLocal(owner);
    active();
    const validated = parseSnapshot(JSON.stringify(snapshot));
    if (!validateResponse('LegacySnapshot', validated)) throw invalid('El historial original necesita revisión antes de importarse. Se conserva sin cambios.');
    const source = legacy.revision > 0 ? 'server' : validated.transactions.length || validated.pockets.length ? 'local' : 'empty';
    return {
      info: { source, transactionCount: validated.transactions.length, pocketCount: validated.pockets.length },
      request: legacy.revision > 0 ? { expectedRevision: '0', legacyRevision: String(legacy.revision) } : { expectedRevision: '0', snapshot: validated },
    };
  }
  async function load(): Promise<CloudFinanceState> {
    await restorePending();
    const fetched = await readCurrent();
    if (fetched.revision === '0') candidate ??= await chooseCandidate();
    else candidate = null;
    active();
    current = fetched;
    return state();
  }
  async function execute(command: StoredCommand, key: string): Promise<string> {
    const write = { idempotencyKey: key };
    switch (command.method) {
      case 'importLegacy': return (await client.importLegacy(command.request, write)).revision;
      case 'createMovement': return (await client.createMovement(command.request, write)).revision;
      case 'deleteMovement': return (await client.deleteMovement(command.id, command.expectedVersion, write)).revision;
      case 'createPocket': return (await client.createPocket(command.request, write)).revision;
      case 'depositToPocket': return (await client.depositToPocket(command.id, command.request, write)).revision;
      case 'withdrawFromPocket': return (await client.withdrawFromPocket(command.id, command.request, write)).revision;
      case 'closePocket': return (await client.closePocket(command.id, command.request, write)).revision;
      case 'clearTransactions': return (await client.clearTransactions(command.request, write)).revision;
      case 'resetFinances': return (await client.resetFinances(command.request, write)).revision;
      case 'importBankTransactions': return (await client.importBankTransactions(command.request, write)).revision;
    }
  }
  async function clearPending(): Promise<void> {
    await storage.setItem(pendingKey, '');
    active();
    pending = null;
  }
  async function retry(): Promise<CloudFinanceState> {
    await restorePending();
    if (!pending) return load();
    const frozen = pending;
    let acknowledgedRevision: string;
    try {
      acknowledgedRevision = await execute(frozen.command, frozen.key);
      active();
      if (!revision(acknowledgedRevision)) throw invalidResponse();
    } catch (error: unknown) {
      if (!disposed && error instanceof FinanceApiError && !error.outcomeUnknown
        && (error.status === 400 || error.status === 404 || error.status === 409)) {
        await clearPending();
        if (frozen.command.method === 'importLegacy') candidate = null;
      }
      throw error;
    }
    // Even a successful write retains its key if the follow-up read or local journal cleanup fails.
    const fetched = await readCurrent();
    if (BigInt(fetched.revision) < BigInt(acknowledgedRevision)) throw invalidResponse();
    await clearPending();
    candidate = null;
    current = fetched;
    return state();
  }
  async function persist(command: StoredCommand, importing = false): Promise<CloudFinanceState> {
    await restorePending();
    if (hasPending()) throw invalid('Hay una operación pendiente. Reinténtala antes de enviar otra.');
    const value = { version: 1, owner, key: `financia-v2-${importing ? 'import' : 'command'}:${options.newId()}`, command };
    const serialized = JSON.stringify(value);
    const frozen = parsePending(serialized, owner);
    // If storage fails, nothing has been sent and the journal is not replaced in memory.
    await storage.setItem(pendingKey, serialized);
    pending = frozen;
    active();
    return retry();
  }
  function prepare(command: CloudCommand): StoredCommand {
    if (!current || current.revision === '0' || candidate) throw invalid('Activa primero la sincronización de esta cuenta.');
    const pocketVersion = (pocketId: string) => {
      const pocket = current!.snapshot.pockets.find(item => item.id === pocketId);
      if (!pocket) throw invalid('El bolsillo ya no está disponible. Actualiza el historial.');
      return pocket.version;
    };
    switch (command.type) {
      case 'createMovement': {
        if (command.data.category === 'ahorro') throw invalid('Usa los bolsillos para transferir ahorros.');
        return { method: 'createMovement', request: { ...command.data, category: command.data.category,
          id: options.newId(), amount: decimal(command.data.amount) } };
      }
      case 'deleteMovement': {
        const movement = current.snapshot.transactions.find(item => item.id === command.id);
        if (!movement) throw invalid('El movimiento ya no está disponible. Actualiza el historial.');
        if (movement.pocketId || movement.category === 'ahorro') throw invalid('Las transferencias se revierten desde el bolsillo.');
        return { method: 'deleteMovement', id: command.id, expectedVersion: movement.version };
      }
      case 'createPocket': return { method: 'createPocket', request: { ...command.data, id: options.newId(), targetAmount: decimal(command.data.targetAmount) } };
      case 'deposit': case 'withdraw': return { method: command.type === 'deposit' ? 'depositToPocket' : 'withdrawFromPocket', id: command.id,
        request: { amount: decimal(command.amount), expectedVersion: pocketVersion(command.id) } };
      case 'closePocket': return { method: 'closePocket', id: command.id, request: { expectedVersion: pocketVersion(command.id) } };
      case 'clearTransactions': return { method: 'clearTransactions', request: { expectedRevision: current.revision } };
      case 'reset': return { method: 'resetFinances', request: { expectedRevision: current.revision } };
      case 'importBankTransactions':
        if (command.data.length > 1000) throw invalid('Importa como máximo 1000 movimientos bancarios por operación.');
        return { method: 'importBankTransactions', request: { transactions: command.data } };
    }
  }
  function run(command: CloudCommand): Promise<CloudFinanceState> {
    // Capture caller edits before waiting for another operation in the queue.
    let frozen: CloudCommand;
    try { frozen = JSON.parse(JSON.stringify(command)) as CloudCommand; }
    catch { return Promise.reject(invalid('La operación no se puede convertir a JSON.')); }
    return enqueue(async () => {
      await restorePending();
      if (hasPending()) throw invalid('Hay una operación pendiente. Reinténtala antes de enviar otra.');
      if (frozen.type === 'importBankTransactions' && frozen.data.length === 0) return state();
      return persist(prepare(frozen));
    });
  }
  return {
    load: () => enqueue(load), refresh: () => enqueue(load), run,
    activate: () => enqueue(async () => {
      await restorePending();
      if (hasPending()) throw invalid('Hay una activación u operación pendiente. Reinténtala para confirmar su resultado.');
      if (!current) await load();
      if (current?.revision !== '0') return state();
      candidate ??= await chooseCandidate();
      return persist({ method: 'importLegacy', request: candidate.request }, true);
    }),
    retryPending: () => enqueue(retry),
    importBankTransactions: (data: Transaction[]) => run({ type: 'importBankTransactions', data }),
    hasPending,
    get pending(): boolean { return hasPending(); },
    dispose: () => { disposed = true; client.dispose(); },
  };
}
