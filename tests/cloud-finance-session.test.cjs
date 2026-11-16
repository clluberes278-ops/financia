const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function loadModules() {
  const cache = new Map();
  function load(candidate) {
    const file = [candidate, candidate + '.ts', candidate + '.json', path.join(candidate, 'index.ts')]
      .find(item => fs.existsSync(item) && fs.statSync(item).isFile());
    if (!file) throw new Error('Missing fixture module: ' + candidate);
    if (file.endsWith('.json')) return JSON.parse(fs.readFileSync(file, 'utf8'));
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, resolveJsonModule: true, esModuleInterop: true },
    }).outputText;
    const requireLocal = name => name === '@financia/api-client' ? load(path.resolve(__dirname, '../packages/api-client/index.ts'))
      : name.startsWith('.') ? load(path.resolve(path.dirname(file), name)) : require(name);
    vm.runInThisContext('(function(require,module,exports){' + code + '\n})', { filename: file })(requireLocal, module, module.exports);
    return module.exports;
  }
  return { ...load(path.resolve(__dirname, '../utils/cloudFinanceSession.ts')), ...load(path.resolve(__dirname, '../packages/api-client/index.ts')) };
}

const { createCloudFinanceSession, FinanceApiError } = loadModules();
const owner = 'user:11111111-1111-1111-1111-111111111111';
const pendingKey = '@financia_pending_v2:' + encodeURIComponent(owner);
const date = '2026-11-15T12:00:00Z';
const empty = () => ({ version: 1, transactions: [], pockets: [] });
const legacyMovement = (id = 'legacy-id') => ({ id, currency: 'DOP', amount: 25.5, type: 'ingreso', category: 'salario', date });
const remoteMovement = (id = 'existing') => ({ ...legacyMovement(id), amount: '25.50', version: '1' });
const clone = value => JSON.parse(JSON.stringify(value));
const remoteEmpty = revision => ({ revision, snapshot: { version: 2, transactions: [], pockets: [] } });
const command = () => ({ type: 'createMovement', data: { currency: 'DOP', amount: 12.34, type: 'ingreso', category: 'salario', date } });

function fixture({ remote = remoteEmpty('1'), local = empty(), legacy = { revision: 0, snapshot: empty() } } = {}) {
  const disk = new Map();
  const calls = [];
  const receipts = new Map();
  const state = { remote: clone(remote), failRead: null, failWrite: null, failStorage: null, localReads: 0, legacyReads: 0, disposed: 0, nextId: 0 };
  const storage = {
    getItem: async key => disk.get(key) ?? null,
    setItem: async (key, value) => {
      if (state.failStorage?.(value)) throw new Error('Storage failure');
      disk.set(key, value);
    },
  };
  function client() {
    return {
      getFinances: async () => {
        calls.push({ method: 'getFinances' });
        if (state.failRead) throw state.failRead;
        return clone(state.remote);
      },
      importLegacy: (body, options) => write('importLegacy', [body, options]),
      createMovement: (body, options) => write('createMovement', [body, options]),
      deleteMovement: (id, version, options) => write('deleteMovement', [id, version, options]),
      createPocket: (body, options) => write('createPocket', [body, options]),
      depositToPocket: (id, body, options) => write('depositToPocket', [id, body, options]),
      withdrawFromPocket: (id, body, options) => write('withdrawFromPocket', [id, body, options]),
      closePocket: (id, body, options) => write('closePocket', [id, body, options]),
      clearTransactions: (body, options) => write('clearTransactions', [body, options]),
      resetFinances: (body, options) => write('resetFinances', [body, options]),
      importBankTransactions: (body, options) => write('importBankTransactions', [body, options]),
      dispose: () => { state.disposed++; },
    };
  }
  async function write(method, args) {
    const options = args.at(-1);
    const journal = JSON.parse(disk.get(pendingKey));
    assert.equal(journal.key, options.idempotencyKey, 'write must be journaled before HTTP');
    assert.equal(journal.owner, owner);
    calls.push({ method, args: clone(args) });
    if (state.failWrite && !state.failWrite.afterCommit) throw state.failWrite.error;
    const receiptKey = method + ':' + options.idempotencyKey;
    if (!receipts.has(receiptKey)) {
      if (method === 'importLegacy') {
        const source = args[0].snapshot ?? legacy.snapshot;
        state.remote = { revision: '1', snapshot: { version: 2,
          transactions: source.transactions.map(item => ({ ...item, amount: item.amount.toFixed(2), version: '1' })),
          pockets: source.pockets.map(item => ({ ...item, targetAmount: item.targetAmount.toFixed(2), currentAmount: item.currentAmount.toFixed(2), version: '1' })),
        } };
      } else if (method === 'createMovement') {
        state.remote.snapshot.transactions.push({ ...args[0], version: '1' });
        state.remote.revision = String(BigInt(state.remote.revision) + 1n);
      } else if (method === 'deleteMovement') {
        const found = state.remote.snapshot.transactions.find(item => item.id === args[0]);
        if (found?.version !== args[1]) throw new FinanceApiError('conflict', 'Stale movement', 409);
        state.remote.snapshot.transactions = state.remote.snapshot.transactions.filter(item => item.id !== args[0]);
        state.remote.revision = String(BigInt(state.remote.revision) + 1n);
      }
      receipts.set(receiptKey, clone(state.remote));
    }
    if (state.failWrite) throw state.failWrite.error;
    return clone(receipts.get(receiptKey));
  }
  const make = overrides => createCloudFinanceSession({
    owner, storage, client: client(), readLocal: async requestedOwner => { assert.equal(requestedOwner, owner); state.localReads++; return clone(local); },
    readLegacy: async () => { state.legacyReads++; return clone(legacy); }, newId: () => 'test-id-' + (++state.nextId), ...overrides,
  });
  return { state, disk, calls, storage, make, client };
}

test('cloud migration is explicit, previews counts, prioritizes server and keeps local history untouched', async () => {
  const original = { ...empty(), transactions: [legacyMovement('local-only')] };
  const historical = { ...empty(), transactions: [legacyMovement('server-only')] };
  for (const source of ['server', 'local', 'empty']) {
    const f = fixture({ remote: remoteEmpty('0'), local: source === 'empty' ? empty() : original,
      legacy: { revision: source === 'server' ? 7 : 0, snapshot: historical } });
    f.disk.set('original-local-backup', JSON.stringify(original));
    const session = f.make();
    const preview = await session.load();
    assert.equal(preview.migration.source, source);
    assert.equal(preview.migration.transactionCount, source === 'empty' ? 0 : 1);
    assert.deepEqual(preview.snapshot, empty());
    assert.equal(f.calls.filter(item => item.method !== 'getFinances').length, 0);
    await assert.rejects(session.run(command()), /Activa primero/);
    const connected = await session.activate();
    assert.equal(connected.migration, null);
    assert.equal(connected.revision, '1');
    assert.equal(connected.pending, false);
    assert.equal(f.disk.get('original-local-backup'), JSON.stringify(original));
    const imported = f.calls.find(item => item.method === 'importLegacy');
    assert.ok(imported.args[1].idempotencyKey.startsWith('financia-v2-import:'));
    if (source === 'server') {
      assert.deepEqual(imported.args[0], { expectedRevision: '0', legacyRevision: '7' });
      assert.equal(f.state.localReads, 0);
    } else assert.equal(imported.args[0].snapshot.version, 1);
  }
});

test('a timed-out committed write survives restart and retries the identical ID, body and key', async () => {
  const f = fixture();
  const first = f.make();
  await first.load();
  f.state.failWrite = { afterCommit: true, error: new FinanceApiError('timeout', 'Timed out', undefined, true) };
  await assert.rejects(first.run(command()), /Timed out/);
  assert.equal(first.pending, true);
  const frozen = f.disk.get(pendingKey);
  const originalWrite = clone(f.calls.find(item => item.method === 'createMovement'));
  first.dispose();
  f.state.failWrite = null;
  const restarted = f.make({ newId: () => { throw new Error('Retry generated a new ID'); } });
  const loaded = await restarted.load();
  assert.equal(loaded.pending, true);
  assert.equal(loaded.snapshot.transactions.length, 1);
  await assert.rejects(restarted.run(command()), /operación pendiente/);
  assert.equal(f.disk.get(pendingKey), frozen);
  const result = await restarted.retryPending();
  assert.equal(result.pending, false);
  assert.equal(f.disk.get(pendingKey), '');
  assert.equal(result.snapshot.transactions.length, 1);
  assert.deepEqual(f.calls.filter(item => item.method === 'createMovement').at(-1), originalWrite);
});

test('activation itself uses the durable journal and retries exactly after a lost response', async () => {
  const f = fixture({ remote: remoteEmpty('0'), local: { ...empty(), transactions: [legacyMovement()] } });
  const first = f.make();
  await first.load();
  f.state.failWrite = { afterCommit: true, error: new FinanceApiError('network', 'Disconnected', undefined, true) };
  await assert.rejects(first.activate(), /Disconnected/);
  const journal = JSON.parse(f.disk.get(pendingKey));
  assert.equal(journal.command.method, 'importLegacy');
  const previous = clone(f.calls.find(item => item.method === 'importLegacy'));
  first.dispose();
  f.state.failWrite = null;
  const restarted = f.make();
  await restarted.load();
  const confirmed = await restarted.retryPending();
  assert.equal(confirmed.snapshot.transactions.length, 1);
  assert.deepEqual(f.calls.filter(item => item.method === 'importLegacy').at(-1), previous);
});

test('malformed or foreign pending records never send and remain intact', async () => {
  for (const journal of [
    'not-json',
    JSON.stringify({ version: 1, owner: 'user:other', key: 'k', command: { method: 'deleteMovement', id: 'm', expectedVersion: '1' } }),
    JSON.stringify({ version: 1, owner, key: 'k', command: { method: 'constructor', request: {} } }),
    JSON.stringify({ version: 1, owner, key: 'k', command: { method: 'deleteMovement', id: 'm', expectedVersion: '-1' } }),
    JSON.stringify({ version: 1, owner, key: 'k', command: { method: 'createMovement', request: { ...remoteMovement(), amount: '1.001' } } }),
  ]) {
    const f = fixture();
    f.disk.set(pendingKey, journal);
    const session = f.make();
    await assert.rejects(session.load());
    assert.equal(session.hasPending(), true);
    assert.equal(f.disk.get(pendingKey), journal);
    assert.equal(f.calls.length, 0);
  }
});

test('cloud read rejects invalid money and versions but preserves valid historical pocket references', async () => {
  const remote = remoteEmpty('9223372036854775807');
  remote.snapshot.transactions = [{ ...remoteMovement(), category: 'ahorro', pocketId: 'closed-pocket' }];
  const f = fixture({ remote });
  const session = f.make();
  const loaded = await session.load();
  assert.equal(loaded.revision, '9223372036854775807');
  assert.equal(loaded.snapshot.transactions[0].amount, 25.5);
  assert.equal(loaded.snapshot.transactions[0].pocketId, 'closed-pocket');
  for (const invalid of ['1.001', '-1.00', '1000000000000.00']) {
    f.state.remote.snapshot.transactions[0].amount = invalid;
    await assert.rejects(session.refresh(), error => error.kind === 'invalid_response');
  }
  f.state.remote.snapshot.transactions[0].amount = '25.50';
  f.state.remote.snapshot.transactions[0].version = '9223372036854775808';
  await assert.rejects(session.refresh(), error => error.kind === 'invalid_response');
  assert.equal(f.state.localReads, 0, 'cloud errors must not fall back to local history');
});

test('storage must succeed before sending and failed journal cleanup remains retryable', async () => {
  const f = fixture();
  const session = f.make();
  await session.load();
  f.state.failStorage = () => true;
  await assert.rejects(session.run(command()), /Storage failure/);
  assert.equal(f.calls.filter(item => item.method === 'createMovement').length, 0);
  assert.equal(session.pending, false);
  f.state.failStorage = value => value === '';
  await assert.rejects(session.run(command()), /Storage failure/);
  assert.equal(session.pending, true);
  assert.equal(f.state.remote.snapshot.transactions.length, 1);
  f.state.failStorage = null;
  const result = await session.retryPending();
  assert.equal(result.pending, false);
  assert.equal(result.snapshot.transactions.length, 1);
});

test('stale versions produce visible conflicts and clear only definitively rejected writes', async () => {
  const remote = remoteEmpty('1');
  remote.snapshot.transactions = [remoteMovement()];
  const f = fixture({ remote });
  const session = f.make();
  await session.load();
  f.state.remote.snapshot.transactions[0].version = '2';
  await assert.rejects(session.run({ type: 'deleteMovement', id: 'existing' }), error => error.status === 409);
  assert.equal(session.pending, false);
  assert.equal(f.calls.find(item => item.method === 'deleteMovement').args[1], '1');
  await session.refresh();
  const result = await session.run({ type: 'deleteMovement', id: 'existing' });
  assert.equal(result.snapshot.transactions.length, 0);
  assert.equal(f.calls.filter(item => item.method === 'deleteMovement').at(-1).args[1], '2');
});

test('auth, server and failed post-write reads retain pending commands rather than losing their keys', async () => {
  for (const error of [new FinanceApiError('unauthorized', 'Sign in', 401), new FinanceApiError('server', 'Try later', 500, true)]) {
    const f = fixture();
    const session = f.make();
    await session.load();
    f.state.failWrite = { error };
    await assert.rejects(session.run(command()), received => received === error);
    assert.equal(session.pending, true);
    assert.ok(f.disk.get(pendingKey));
  }
  const f = fixture();
  const session = f.make();
  await session.load();
  f.state.failRead = new FinanceApiError('network', 'Read failed');
  await assert.rejects(session.run(command()), /Read failed/);
  assert.equal(session.pending, true);
  f.state.failRead = null;
  assert.equal((await session.retryPending()).snapshot.transactions.length, 1);
});

test('disposing the session prevents late reads from activating another account state', async () => {
  const f = fixture();
  let finish;
  let started;
  const began = new Promise(resolve => { started = resolve; });
  const delayed = new Promise(resolve => { finish = resolve; });
  const client = f.client();
  client.getFinances = async () => { started(); return delayed; };
  const session = f.make({ client });
  const loading = session.load();
  await began;
  session.dispose();
  finish(remoteEmpty('1'));
  await assert.rejects(loading, error => error.kind === 'session_changed');
  assert.equal(f.state.disposed, 1);
  await assert.rejects(session.run(command()), error => error.kind === 'session_changed');
});

test('queued caller edits cannot change the frozen command, and bank imports never silently truncate', async () => {
  const f = fixture();
  const session = f.make();
  await session.load();
  const data = command();
  const running = session.run(data);
  data.data.amount = 999;
  await running;
  assert.equal(f.calls.find(item => item.method === 'createMovement').args[0].amount, '12.34');
  const before = f.calls.length;
  await session.importBankTransactions([]);
  assert.equal(f.calls.length, before);
  await assert.rejects(session.importBankTransactions(Array.from({ length: 1001 }, (_, index) => legacyMovement('gmail:bank:' + index))), /1000/);
});
