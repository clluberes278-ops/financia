import type { FinancialSnapshot } from '../types/finance';
import { parseSnapshot } from './financialRepository';

interface Repository {
  read: (owner: string) => Promise<FinancialSnapshot>;
  update: (owner: string, transform: (snapshot: FinancialSnapshot) => FinancialSnapshot) => Promise<FinancialSnapshot>;
  hasLegacyData: () => Promise<boolean>;
}
interface RemoteDocument { revision: number; snapshot: FinancialSnapshot }
type Request = (owner: string, method: 'GET' | 'PUT', body?: string) => Promise<unknown>;

function parseDocument(value: unknown): RemoteDocument {
  if (typeof value !== 'object' || value === null || !('revision' in value) || !('snapshot' in value)
    || typeof value.revision !== 'number' || !Number.isSafeInteger(value.revision) || value.revision < 0) {
    throw new Error('El servidor devolvió un historial inválido.');
  }
  return { revision: value.revision, snapshot: parseSnapshot(JSON.stringify(value.snapshot)) };
}

// Opt-in server repository. Guest data always stays local. No silent offline writes.
export function createRemoteFinanceRepository(local: Repository, request: Request): Repository {
  let queue: Promise<unknown> = Promise.resolve();
  const enqueue = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = queue.then(operation);
    queue = result.catch(() => undefined);
    return result;
  };
  async function readRemote(owner: string): Promise<RemoteDocument> {
    const remote = parseDocument(await request(owner, 'GET'));
    if (remote.revision === 0) {
      const existing = await local.read(owner);
      if (existing.transactions.length || existing.pockets.length) {
        // Only import into a new account. Revision 0 prevents overwriting another device.
        return parseDocument(await request(owner, 'PUT', JSON.stringify({ expectedRevision: 0, snapshot: existing })));
      }
    }
    return remote;
  }
  return {
    hasLegacyData: local.hasLegacyData,
    read: owner => !owner.startsWith('user:') ? local.read(owner) : enqueue(async () => (await readRemote(owner)).snapshot),
    update: (owner, transform) => !owner.startsWith('user:') ? local.update(owner, transform) : enqueue(async () => {
      const remote = await readRemote(owner);
      const next = transform(remote.snapshot);
      parseSnapshot(JSON.stringify(next));
      const saved = parseDocument(await request(owner, 'PUT', JSON.stringify({ expectedRevision: remote.revision, snapshot: next })));
      return saved.snapshot;
    }),
  };
}
