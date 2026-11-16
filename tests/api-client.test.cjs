const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function loadClient() {
  const cache = new Map();
  function load(candidate) {
    const options = [candidate, candidate + '.ts', candidate + '.json', path.join(candidate, 'index.ts')];
    const file = options.find(option => fs.existsSync(option) && fs.statSync(option).isFile());
    if (!file) throw new Error('No local module found: ' + candidate);
    if (file.endsWith('.json')) return JSON.parse(fs.readFileSync(file, 'utf8'));
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} };
    cache.set(file, module);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, resolveJsonModule: true, esModuleInterop: true },
    }).outputText;
    const localRequire = name => name.startsWith('.') ? load(path.resolve(path.dirname(file), name)) : require(name);
    vm.runInThisContext('(function(require,module,exports){' + code + '\n})', { filename: file })(localRequire, module, module.exports);
    return module.exports;
  }
  return load(path.resolve(__dirname, '../packages/api-client/index.ts'));
}

const userId = '11111111-1111-1111-1111-111111111111';
const anotherUser = '22222222-2222-2222-2222-222222222222';
const date = '2026-11-14T16:00:00.0000000Z';
const movement = { id: 'movement-1', currency: 'DOP', amount: '1250.50', type: 'ingreso', category: 'salario', date, version: '1' };
const pocket = { id: 'pocket-1', name: 'Reserva', currency: 'DOP', targetAmount: '2000.00', currentAmount: '0.00', emoji: 'R', createdAt: date, version: '1' };
const empty = { revision: '0', snapshot: { version: 2, transactions: [], pockets: [] } };
const importBody = { expectedRevision: '0', snapshot: { version: 1, transactions: [], pockets: [] } };
const createBody = { id: movement.id, currency: movement.currency, amount: movement.amount, type: movement.type, category: movement.category, date };
const updateBody = { expectedVersion: '1', currency: 'DOP', amount: '20.00', type: 'gasto', category: 'comida', date, note: null };
const pocketBody = { id: pocket.id, name: pocket.name, currency: 'DOP', targetAmount: '2000.00', emoji: 'R' };
const editPocketBody = { expectedVersion: '1', name: 'Reserva corregida', targetAmount: '3000.00', emoji: 'R' };
const transferBody = { amount: '25.00', expectedVersion: '1' };
const closeBody = { expectedVersion: '1' };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const configuration = (fetch, overrides = {}) => ({
  baseUrl: 'https://api.example.test/base/', userId, getSession: async () => ({ userId, accessToken: 'token-current' }), fetch, ...overrides,
});
const abortingFetch = async (_url, options) => new Promise((_resolve, reject) => {
  const aborted = () => reject(new DOMException('private transport detail', 'AbortError'));
  if (options.signal.aborted) aborted();
  else options.signal.addEventListener('abort', aborted, { once: true });
});

test('shared API client maps every method, escapes IDs and sends current auth and stable keys', async () => {
  const { createFinanceClient } = loadClient();
  const id = 'id /?#';
  const escaped = encodeURIComponent(id);
  const scenarios = [
    { method: 'GET', route: '/api/v2/finances', run: client => client.getFinances(), response: empty },
    { method: 'POST', route: '/api/v2/imports/legacy', body: importBody, run: (client, options) => client.importLegacy(importBody, options), response: { ...empty, revision: '1' } },
    { method: 'POST', route: '/api/v2/movements', body: createBody, run: (client, options) => client.createMovement(createBody, options), response: { revision: '2', movement }, status: 201 },
    { method: 'PATCH', route: '/api/v2/movements/' + escaped, body: updateBody, run: (client, options) => client.updateMovement(id, updateBody, options), response: { revision: '3', movement: { ...movement, currency: updateBody.currency, amount: updateBody.amount, type: updateBody.type, category: updateBody.category, version: '2' } } },
    { method: 'DELETE', route: '/api/v2/movements/' + escaped + '?expectedVersion=2', run: (client, options) => client.deleteMovement(id, '2', options), response: { revision: '4', id, version: '3', deleted: true } },
    { method: 'POST', route: '/api/v2/pockets', body: pocketBody, run: (client, options) => client.createPocket(pocketBody, options), response: { revision: '5', pocket }, status: 201 },
    { method: 'PATCH', route: '/api/v2/pockets/' + escaped, body: editPocketBody, run: (client, options) => client.editPocket(id, editPocketBody, options), response: { revision: '6', pocket: { ...pocket, version: '2' } } },
    { method: 'POST', route: '/api/v2/pockets/' + escaped + '/deposit', body: transferBody, run: (client, options) => client.depositToPocket(id, transferBody, options), response: { revision: '7', pocket, movement: { ...movement, category: 'ahorro', type: 'gasto', pocketId: pocket.id } } },
    { method: 'POST', route: '/api/v2/pockets/' + escaped + '/withdraw', body: transferBody, run: (client, options) => client.withdrawFromPocket(id, transferBody, options), response: { revision: '8', pocket, movement: { ...movement, category: 'ahorro', pocketId: pocket.id } } },
    { method: 'POST', route: '/api/v2/pockets/' + escaped + '/close', body: closeBody, run: (client, options) => client.closePocket(id, closeBody, options), response: { revision: '9', pocket, movement: null } },
    { method: 'POST', route: '/api/v2/finances/clear-transactions', body: { expectedRevision: '9' }, run: (client, options) => client.clearTransactions({ expectedRevision: '9' }, options), response: { revision: '10', cleared: true, scope: 'transactions' } },
    { method: 'POST', route: '/api/v2/finances/reset', body: { expectedRevision: '10' }, run: (client, options) => client.resetFinances({ expectedRevision: '10' }, options), response: { revision: '11', cleared: true, scope: 'all' } },
    { method: 'POST', route: '/api/v2/imports/bank', body: { transactions: [] }, run: (client, options) => client.importBankTransactions({ transactions: [] }, options), response: { revision: '12', imported: 0, skipped: 0 } },
  ];
  let current = 0;
  let accessToken = 'token-0';
  const calls = [];
  const client = createFinanceClient(configuration(async (url, options) => {
    calls.push({ url: String(url), options });
    return json(scenarios[current].response, scenarios[current].status);
  }, { getSession: async () => ({ userId, accessToken }) }));
  try {
    for (current = 0; current < scenarios.length; current++) {
      const scenario = scenarios[current];
      accessToken = 'token-' + current;
      const result = await scenario.run(client, { idempotencyKey: 'stable-key-' + current });
      assert.deepEqual(result, scenario.response);
      const call = calls[current];
      const headers = new Headers(call.options.headers);
      assert.equal(call.url, 'https://api.example.test/base' + scenario.route);
      assert.equal(call.options.method, scenario.method);
      assert.equal(call.options.redirect, 'error');
      assert.equal(call.options.credentials, 'omit');
      assert.equal(headers.get('Authorization'), 'Bearer token-' + current);
      if (scenario.method === 'GET') assert.equal(headers.get('Idempotency-Key'), null);
      else assert.equal(headers.get('Idempotency-Key'), 'stable-key-' + current);
      if (scenario.body) assert.deepEqual(JSON.parse(call.options.body), scenario.body);
      else assert.ok(call.options.body == null);
    }
    assert.equal(calls.length, scenarios.length);
  } finally { client.dispose(); }
});

test('client preserves decimal and large revision strings and rejects corrupt successful responses', async () => {
  const { createFinanceClient, FinanceApiError } = loadClient();
  const valid = { revision: '9007199254740993', snapshot: { version: 2, transactions: [{ ...movement, amount: '999999999999.99' }], pockets: [pocket] } };
  const fixtures = [
    valid,
    { ...valid, snapshot: { ...valid.snapshot, transactions: [{ ...movement, amount: 1250.50 }] } },
    { ...valid, snapshot: { ...valid.snapshot, transactions: [{ ...movement, currency: 'EUR' }] } },
    { ...empty, revision: 1 },
    { revision: '1', snapshot: { version: 2, transactions: [], pockets: [{ ...pocket, currentAmount: '-1.00' }] } },
  ];
  let index = 0;
  const client = createFinanceClient(configuration(async () => json(fixtures[index])));
  try {
    const result = await client.getFinances();
    assert.equal(result.revision, '9007199254740993');
    assert.equal(result.snapshot.transactions[0].amount, '999999999999.99');
    for (index = 1; index < fixtures.length; index++) {
      await assert.rejects(client.getFinances(), error => error instanceof FinanceApiError && error.kind === 'invalid_response' && !error.outcomeUnknown);
    }
  } finally { client.dispose(); }
});

test('HTTP errors are classified and HTML bodies are never surfaced as user messages', async () => {
  const { createFinanceClient, FinanceApiError } = loadClient();
  const cases = [[400, 'validation'], [401, 'unauthorized'], [403, 'forbidden'], [404, 'not_found'], [409, 'conflict'], [503, 'server']];
  for (const [status, kind] of cases) {
    const client = createFinanceClient(configuration(async () => json({ error: 'Mensaje seguro del servidor' }, status)));
    try {
      await assert.rejects(client.getFinances(), error => error instanceof FinanceApiError && error.kind === kind && error.status === status && !error.outcomeUnknown);
    } finally { client.dispose(); }
  }
  const client = createFinanceClient(configuration(async () => new Response('<html>private-proxy-password</html>', { status: 400, headers: { 'Content-Type': 'text/html' } })));
  try {
    await assert.rejects(client.getFinances(), error => error.kind === 'validation' && !error.message.includes('private-proxy-password') && !error.message.includes('<html>'));
  } finally { client.dispose(); }
});

test('write retries are caller-controlled and reuse the supplied key without automatic resend', async () => {
  const { createFinanceClient } = loadClient();
  const keys = [];
  const client = createFinanceClient(configuration(async (_url, options) => {
    keys.push(new Headers(options.headers).get('Idempotency-Key'));
    if (keys.length === 1) throw new TypeError('private-internal-network-address');
    return json({ revision: '2', movement }, 201);
  }));
  try {
    await assert.rejects(client.createMovement(createBody, { idempotencyKey: 'repeat-me' }), error =>
      error.kind === 'network' && error.outcomeUnknown && !error.message.includes('private-internal-network-address'));
    assert.equal(keys.length, 1);
    const result = await client.createMovement(createBody, { idempotencyKey: 'repeat-me' });
    assert.equal(result.movement.amount, '1250.50');
    assert.deepEqual(keys, ['repeat-me', 'repeat-me']);
  } finally { client.dispose(); }
});

test('writes require an explicit key and invalid response JSON makes their result uncertain', async () => {
  const { createFinanceClient } = loadClient();
  let calls = 0;
  const client = createFinanceClient(configuration(async () => {
    calls++;
    return new Response('{broken', { status: 201, headers: { 'Content-Type': 'application/json' } });
  }));
  try {
    for (const options of [undefined, {}, { idempotencyKey: '' }, { idempotencyKey: '  ' }]) {
      await assert.rejects(client.createMovement(createBody, options), error => !error.outcomeUnknown);
    }
    assert.equal(calls, 0);
    await assert.rejects(client.createMovement(createBody, { idempotencyKey: 'once' }), error => error.kind === 'invalid_response' && error.outcomeUnknown);
    assert.equal(calls, 1);
  } finally { client.dispose(); }
});

test('sessions are checked before requests and again after responses', async () => {
  const { createFinanceClient } = loadClient();
  let calls = 0;
  let activeSession = { userId: anotherUser, accessToken: 'other-user-token' };
  const client = createFinanceClient(configuration(async () => { calls++; return json(empty); }, { getSession: async () => activeSession }));
  try {
    await assert.rejects(client.getFinances(), error => error.kind === 'session_changed' && !error.outcomeUnknown);
    assert.equal(calls, 0);
    activeSession = null;
    await assert.rejects(client.getFinances(), error => ['unauthorized', 'session_changed'].includes(error.kind) && !error.outcomeUnknown);
    assert.equal(calls, 0);
  } finally { client.dispose(); }

  let user = userId;
  const changed = createFinanceClient(configuration(async () => {
    user = anotherUser;
    return json({ revision: '2', movement }, 201);
  }, { getSession: async () => ({ userId: user, accessToken: 'token' }) }));
  try {
    await assert.rejects(changed.createMovement(createBody, { idempotencyKey: 'account-bound' }), error => error.kind === 'session_changed' && error.outcomeUnknown);
  } finally { changed.dispose(); }
});

test('changing accounts while the response body is pending does not return stale data', async () => {
  const { createFinanceClient } = loadClient();
  let user = userId;
  let controller;
  let started;
  const fetched = new Promise(resolve => { started = resolve; });
  const stream = new ReadableStream({ start(value) { controller = value; } });
  const client = createFinanceClient(configuration(async () => {
    started();
    return new Response(stream, { status: 200, headers: { 'Content-Type': 'application/json' } });
  }, { getSession: async () => ({ userId: user, accessToken: 'token' }) }));
  try {
    const pending = client.getFinances();
    const rejected = assert.rejects(pending, error => error.kind === 'session_changed' && !error.outcomeUnknown);
    await fetched;
    user = anotherUser;
    controller.enqueue(new TextEncoder().encode(JSON.stringify(empty)));
    controller.close();
    await rejected;
  } finally { client.dispose(); }
});

test('timeouts and cancellation distinguish unsent requests from uncertain writes', async () => {
  const { createFinanceClient } = loadClient();
  for (const write of [false, true]) {
    const client = createFinanceClient(configuration(abortingFetch, { timeoutMs: 15 }));
    try {
      const pending = write ? client.createMovement(createBody, { idempotencyKey: 'timeout' }) : client.getFinances();
      await assert.rejects(pending, error => error.kind === 'timeout' && error.outcomeUnknown === write);
    } finally { client.dispose(); }
  }
  let calls = 0;
  const client = createFinanceClient(configuration(async () => { calls++; return json(empty); }));
  const cancellation = new AbortController();
  cancellation.abort();
  try {
    await assert.rejects(client.createMovement(createBody, { idempotencyKey: 'unsent', signal: cancellation.signal }), error => error.kind === 'cancelled' && !error.outcomeUnknown);
    assert.equal(calls, 0);
  } finally { client.dispose(); }
});

test('disposing aborts active writes and permanently rejects this account-bound client', async () => {
  const { createFinanceClient } = loadClient();
  let started;
  const fetched = new Promise(resolve => { started = resolve; });
  const client = createFinanceClient(configuration(async (url, options) => {
    started();
    return abortingFetch(url, options);
  }));
  const pending = client.createMovement(createBody, { idempotencyKey: 'in-flight' });
  const rejected = assert.rejects(pending, error => error.kind === 'session_changed' && error.outcomeUnknown);
  await fetched;
  client.dispose();
  await rejected;
  await assert.rejects(client.getFinances(), error => error.kind === 'session_changed' && !error.outcomeUnknown);
});

test('command content and retry key are captured before waiting for a session', async () => {
  const { createFinanceClient } = loadClient();
  let unlock;
  let calls = 0;
  const waiting = new Promise(resolve => { unlock = resolve; });
  const request = { ...createBody };
  const write = { idempotencyKey: 'original-key' };
  const client = createFinanceClient(configuration(async (_url, options) => {
    calls++;
    assert.equal(options.headers['Idempotency-Key'], 'original-key');
    assert.equal(JSON.parse(options.body).amount, '1250.50');
    assert.equal(options.cache, 'no-store');
    return json({ revision: '2', movement }, 201);
  }, { getSession: async () => { await waiting; return { userId, accessToken: 'token' }; } }));
  try {
    const pending = client.createMovement(request, write);
    request.amount = '999.00';
    write.idempotencyKey = 'changed-key';
    unlock();
    await pending;
    assert.equal(calls, 1);
    await assert.rejects(client.createMovement(createBody), error => error.kind === 'validation' && !error.outcomeUnknown);
    const cyclic = { ...createBody }; cyclic.loop = cyclic;
    await assert.rejects(client.createMovement(cyclic, { idempotencyKey: 'cyclic' }), error => error.kind === 'validation' && !error.outcomeUnknown);
    assert.equal(calls, 1);
  } finally { client.dispose(); }
});

test('base URLs must be safe and local HTTP is explicitly limited to supported development hosts', () => {
  const { createFinanceClient, FinanceApiError } = loadClient();
  for (const baseUrl of ['http://example.com', 'javascript:alert(1)', 'https://name:password@example.com', 'https://api.example.com/?token=secret', 'https://api.example.com/#fragment', '/relative', 'http://127.0.0.2:5080']) {
    assert.throws(() => createFinanceClient(configuration(async () => json(empty), { baseUrl })), error => error instanceof FinanceApiError && error.kind === 'configuration' && !error.outcomeUnknown);
  }
  for (const baseUrl of ['https://api.example.com/root', 'http://localhost:5080', 'http://127.0.0.1:5080', 'http://10.0.2.2:5080', 'http://[::1]:5080']) {
    const client = createFinanceClient(configuration(async () => json(empty), { baseUrl }));
    client.dispose();
  }
});
