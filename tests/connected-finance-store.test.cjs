const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const snapshot = () => ({ version: 1, transactions: [], pockets: [] });
const movement = id => ({ id, currency: 'DOP', amount: 10, type: 'ingreso', category: 'salario', date: '2026-11-15T12:00:00Z' });
const cloudState = (extra = {}) => ({ snapshot: snapshot(), revision: '1', migration: null, pending: false, ...extra });
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }

function fixture(connect) {
  const disk = new Map();
  const sessions = [];
  const storage = { getItem: async key => disk.get(key) ?? null, setItem: async (key, value) => { disk.set(key, value); } };
  const cache = new Map();
  function load(relative) {
    const file = path.resolve(__dirname, '../apps/mobile', relative);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const mocks = {
      '@react-native-async-storage/async-storage': { __esModule: true, default: storage },
      '../utils/supabase': { supabase: null }, '../utils/financeApi': { financeApiUrl: 'https://api.example.test' },
      '../utils/connectedFinanceSession': { connectFinanceSession: (...args) => { const session = connect(...args); sessions.push(session); return session; } },
    };
    const requireLocal = name => Object.hasOwn(mocks, name) ? mocks[name] : name.startsWith('.')
      ? load(path.resolve(path.dirname(file), name + (path.extname(name) ? '' : '.ts'))) : require(name);
    vm.runInThisContext('(function(require,module,exports){' + code + '\n})', { filename: file })(requireLocal, module, module.exports);
    return module.exports;
  }
  return { store: load('store/useFinanceStore.ts').useFinanceStore, disk, sessions };
}
function session(extra = {}) {
  return { load: async () => cloudState(), activate: async () => cloudState(), run: async () => cloudState(),
    refresh: async () => cloudState(), retryPending: async () => cloudState(), hasPending: () => false, dispose: () => {}, ...extra };
}

test('configured cloud keeps guests local and requires explicit activation for authenticated accounts', async () => {
  const commands = [];
  let activations = 0;
  const f = fixture(() => session({
    load: async () => cloudState({ revision: '0', migration: { source: 'local', transactionCount: 1, pocketCount: 0 } }),
    activate: async () => { activations++; return cloudState({ snapshot: { ...snapshot(), transactions: [movement('server')] } }); },
    run: async command => { commands.push(command); return cloudState({ revision: '2' }); },
  }));
  await f.store.getState().activateOwner('guest');
  await f.store.getState().addTransaction(movement('guest'));
  assert.equal(f.sessions.length, 0);
  assert.equal(f.store.getState().syncMode, 'local');
  const guestOriginal = [...f.disk.entries()];
  await f.store.getState().activateOwner('user:alice');
  assert.equal(f.store.getState().syncMode, 'cloud');
  assert.equal(f.store.getState().migration.transactionCount, 1);
  assert.equal(activations, 0);
  assert.deepEqual(f.store.getState().transactions, []);
  await f.store.getState().activateCloud();
  assert.equal(activations, 1);
  assert.equal(f.store.getState().transactions[0].id, 'server');
  await f.store.getState().addTransaction(movement('new'));
  await f.store.getState().createPocket({ name: 'Viaje', currency: 'DOP', targetAmount: 100 });
  await f.store.getState().depositToPocket('p1', 10);
  await f.store.getState().withdrawFromPocket('p1', 5);
  await f.store.getState().deletePocket('p1');
  await f.store.getState().clearAllTransactions();
  await f.store.getState().clearAllData();
  assert.deepEqual(commands.map(command => command.type), ['createMovement', 'createPocket', 'deposit', 'withdraw', 'closePocket', 'clearTransactions', 'reset']);
  assert.deepEqual([...f.disk.entries()], guestOriginal);
});

test('a failed initial server read never activates local data as a silent fallback', async () => {
  let attempts = 0;
  const f = fixture(() => session({ load: async () => { if (++attempts === 1) throw new Error('API no disponible'); return cloudState(); } }));
  await f.store.getState().activateOwner('user:alice');
  assert.equal(f.store.getState().isLoaded, false);
  assert.match(f.store.getState().error, /API no disponible/);
  assert.equal(f.store.getState().syncMode, 'cloud');
  await f.store.getState().activateOwner('user:alice');
  assert.equal(f.store.getState().isLoaded, true);
  assert.equal(attempts, 2);
});

test('late command responses and notification callbacks cannot update a different account', async () => {
  const delayed = deferred();
  let disposed = 0;
  const f = fixture(() => session({ run: async () => delayed.promise, dispose: () => { disposed++; } }));
  await f.store.getState().activateOwner('user:alice');
  const command = f.store.getState().addTransaction(movement('old'));
  assert.equal(f.store.getState().isSyncing, true);
  await f.store.getState().activateOwner('guest');
  f.store.getState().setSyncError('user:alice', 'old account error');
  f.store.getState().setSyncStatus('user:alice', 'connected');
  delayed.resolve(cloudState({ snapshot: { ...snapshot(), transactions: [movement('late')] } }));
  await command;
  assert.equal(disposed, 1);
  assert.equal(f.store.getState().owner, 'guest');
  assert.equal(f.store.getState().isSyncing, false);
  assert.equal(f.store.getState().error, null);
  assert.equal(f.store.getState().syncStatus, 'local');
  assert.deepEqual(f.store.getState().transactions, []);
});

test('an event arriving during refresh triggers another read without concurrent refresh requests', async () => {
  const reading = deferred();
  let reads = 0;
  const f = fixture(() => session({ refresh: async () => ++reads === 1 ? reading.promise : cloudState({ revision: '3' }) }));
  await f.store.getState().activateOwner('user:alice');
  const first = f.store.getState().refresh();
  await Promise.resolve();
  const second = f.store.getState().refresh();
  assert.equal(reads, 1);
  reading.resolve(cloudState({ revision: '2' }));
  assert.deepEqual(await Promise.all([first, second]), [true, true]);
  assert.equal(reads, 2);
  assert.equal(f.store.getState().cloudRevision, '3');
});

test('manual refresh acknowledges unchanged history, preserves the confirmed time on failure and recovers', async () => {
  let fail = false;
  let reads = 0;
  const confirmed = cloudState({ snapshot: { ...snapshot(), transactions: [movement('confirmed')] } });
  const f = fixture(() => session({ load: async () => confirmed, refresh: async () => {
    reads++;
    if (fail) throw new Error('API no disponible');
    return confirmed;
  } }));
  await f.store.getState().activateOwner('guest');
  assert.equal(await f.store.getState().refresh(), false);
  assert.equal(f.store.getState().lastSyncedAt, null);
  await f.store.getState().activateOwner('user:alice');
  assert.equal(typeof f.store.getState().lastSyncedAt, 'number');
  assert.equal(await f.store.getState().refresh(), true);
  const lastSuccess = f.store.getState().lastSyncedAt;
  fail = true;
  assert.equal(await f.store.getState().refresh(), false);
  assert.equal(f.store.getState().lastSyncedAt, lastSuccess);
  assert.equal(f.store.getState().transactions[0].id, 'confirmed');
  assert.match(f.store.getState().error, /API no disponible/);
  assert.equal(f.store.getState().isSyncing, false);
  fail = false;
  assert.equal(await f.store.getState().refresh(), true);
  assert.equal(f.store.getState().error, null);
  assert.equal(reads, 3);
});

test('a refresh finishing after account change cannot acknowledge success or update the new owner time', async () => {
  const reading = deferred();
  const f = fixture(() => session({ refresh: () => reading.promise }));
  await f.store.getState().activateOwner('user:alice');
  const result = f.store.getState().refresh();
  await Promise.resolve();
  assert.equal(f.store.getState().isSyncing, true);
  await f.store.getState().activateOwner('guest');
  reading.resolve(cloudState());
  assert.equal(await result, false);
  assert.equal(f.store.getState().lastSyncedAt, null);
  assert.equal(f.store.getState().owner, 'guest');
});

test('uncertain writes expose a pending operation and retry resolves it using the cloud journal', async () => {
  let pending = false;
  const f = fixture(() => session({
    hasPending: () => pending,
    run: async () => { pending = true; throw new Error('Resultado pendiente de confirmar'); },
    retryPending: async () => { pending = false; return cloudState({ revision: '2', snapshot: { ...snapshot(), transactions: [movement('once')] } }); },
  }));
  await f.store.getState().activateOwner('user:alice');
  await assert.rejects(f.store.getState().addTransaction(movement('once')), /pendiente/);
  assert.equal(f.store.getState().pendingOperation, true);
  assert.deepEqual(f.store.getState().transactions, []);
  await f.store.getState().retryPending();
  assert.equal(f.store.getState().pendingOperation, false);
  assert.equal(f.store.getState().error, null);
  assert.equal(f.store.getState().transactions.length, 1);
});

test('large Gmail imports are batched without truncation and stop immediately if the owner changes', async () => {
  const commands = [];
  const f = fixture(() => session({ run: async command => { commands.push(command); return cloudState(); } }));
  const notices = Array.from({ length: 1001 }, (_, index) => movement('gmail:bhd:' + index));
  await f.store.getState().activateOwner('user:alice');
  await f.store.getState().importBankTransactions(notices, 'user:alice');
  assert.deepEqual(commands.map(command => command.data.length), [1000, 1]);
  assert.equal(commands[1].data[0].id, 'gmail:bhd:1000');

  let writes = 0;
  const switched = fixture(() => session({ run: async () => {
    writes++;
    await switched.store.getState().activateOwner('guest');
    return cloudState();
  } }));
  await switched.store.getState().activateOwner('user:alice');
  await assert.rejects(switched.store.getState().importBankTransactions(notices, 'user:alice'), /cuenta cambió/);
  assert.equal(writes, 1);
  assert.equal(switched.store.getState().owner, 'guest');
  assert.deepEqual(switched.store.getState().transactions, []);
});

test('a rejected activation refreshes the proposed source before another confirmation', async () => {
  let confirmations = 0;
  const f = fixture(() => session({
    load: async () => cloudState({ revision: '0', migration: { source: 'local', transactionCount: 1, pocketCount: 0 } }),
    activate: async () => { confirmations++; throw new Error('El historial del servidor cambió.'); },
    refresh: async () => cloudState({ revision: '0', migration: { source: 'server', transactionCount: 5, pocketCount: 2 } }),
  }));
  await f.store.getState().activateOwner('user:alice');
  await assert.rejects(f.store.getState().activateCloud(), /cambió/);
  assert.equal(confirmations, 1);
  assert.equal(f.store.getState().migration.source, 'server');
  assert.equal(f.store.getState().migration.transactionCount, 5);
  assert.match(f.store.getState().error, /cambió/);
});
