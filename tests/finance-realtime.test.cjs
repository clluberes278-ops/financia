const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function fixture({ start, stop, getAccessToken, buildError = false } = {}) {
  const events = new Map();
  const timers = new Map();
  const configuration = {};
  let nextTimer = 0;
  const connection = {
    starts: 0, stops: 0,
    on: (name, callback) => events.set(name, callback),
    off: name => events.delete(name),
    onreconnecting(callback) { this.reconnecting = callback; },
    onreconnected(callback) { this.reconnected = callback; },
    onclose(callback) { this.closed = callback; },
    start() { this.starts++; assert.ok(events.has('FinanceChanged'), 'subscribe before starting'); return start ? start() : Promise.resolve(); },
    stop() { this.stops++; return stop ? stop() : Promise.resolve(); },
  };
  class HubConnectionBuilder {
    withUrl(url, options) { configuration.url = url; configuration.options = options; return this; }
    withAutomaticReconnect(delays) { configuration.delays = [...delays]; return this; }
    configureLogging(level) { configuration.logLevel = level; return this; }
    build() { if (buildError) throw new Error('private URL/token'); return connection; }
  }
  const file = path.resolve(__dirname, '../apps/mobile/utils/financeRealtime.ts');
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext('(function(require,module,exports){' + code + '\n})', {
    setTimeout: (callback, delay) => { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
    clearTimeout: id => timers.delete(id),
  }, { filename: file })(name => {
    assert.equal(name, '@microsoft/signalr');
    return { HubConnectionBuilder, LogLevel: { None: 6 } };
  }, module, module.exports);
  const statuses = [];
  const errors = [];
  let changes = 0;
  let token = 'token-initial';
  const cleanup = module.exports.startFinanceRealtime({
    baseUrl: 'https://api.example.test/base/', getAccessToken: getAccessToken ?? (async () => token),
    onChange: () => changes++, onStatus: status => statuses.push(status), onError: message => errors.push(message),
  });
  return {
    connection, configuration, timers, statuses, errors, cleanup,
    changes: () => changes,
    token: value => { token = value; },
    event: value => events.get('FinanceChanged')?.(value),
    runTimer: () => {
      const next = timers.entries().next().value;
      assert.ok(next, 'a retry must be scheduled');
      timers.delete(next[0]);
      next[1].callback();
      return next[1].delay;
    },
  };
}
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
const event = (revision, tail = '1') => ({ eventId: '11111111-1111-4111-8111-' + tail.padStart(12, '0'), revision });

test('realtime authenticates freshly, suppresses transport logs, and refreshes after initial connection', async () => {
  const f = fixture();
  assert.equal(typeof f.cleanup, 'function');
  assert.equal(f.connection.starts, 1);
  assert.equal(f.configuration.url, 'https://api.example.test/base/hubs/finances');
  assert.equal(f.configuration.options.withCredentials, false);
  assert.equal(f.configuration.logLevel, 6);
  assert.deepEqual(f.configuration.delays, [0, 1000, 5000, 15000]);
  assert.equal(await f.configuration.options.accessTokenFactory(), 'token-initial');
  f.token('token-refreshed');
  assert.equal(await f.configuration.options.accessTokenFactory(), 'token-refreshed');
  await flush();
  assert.deepEqual(f.statuses, ['connecting', 'connected']);
  assert.equal(f.changes(), 1);
  f.cleanup();
});

test('events validate UUIDs and long revisions without rounding and skip duplicates or older revisions', async () => {
  const f = fixture();
  await flush();
  f.event(event('9007199254740992'));
  f.event(event('9007199254740993', '2'));
  f.event(event('9007199254740993', '2'));
  f.event(event('2', '3'));
  f.event(event('9007199254740994', '2'));
  assert.equal(f.changes(), 3);
  for (const invalid of [null, [], {}, { eventId: 'wrong', revision: '5' }, event(5), event('-1'), event('1.5'), event('01'), event('9223372036854775808'), event('9'.repeat(100))]) {
    f.event(invalid);
  }
  assert.equal(f.changes(), 3);
  assert.equal(f.errors.length, 10);
  f.event(event('9223372036854775807', '4'));
  assert.equal(f.changes(), 4);
  f.cleanup();
});

test('reconnect always refreshes even when no new event was observed', async () => {
  const f = fixture();
  await flush();
  f.event(event('100'));
  f.connection.reconnecting(new Error('private transport details'));
  assert.equal(f.statuses.at(-1), 'reconnecting');
  f.connection.reconnected('new-connection-id');
  assert.equal(f.statuses.at(-1), 'connected');
  assert.equal(f.changes(), 3);
  f.event(event('100'));
  assert.equal(f.changes(), 3);
  assert.equal(f.timers.size, 0);
  f.cleanup();
});

test('failed initial starts retry, then exhausted automatic reconnect also restarts manually', async () => {
  let attempts = 0;
  const f = fixture({ start: async () => { if (++attempts === 1) throw new Error('token-secret'); } });
  await flush();
  assert.equal(f.statuses.at(-1), 'offline');
  assert.equal(f.changes(), 0);
  assert.equal(f.errors.length, 1);
  assert.ok(!f.errors[0].includes('token-secret'));
  assert.equal(f.runTimer(), 15000);
  await flush();
  assert.equal(f.connection.starts, 2);
  assert.equal(f.statuses.at(-1), 'connected');
  assert.equal(f.changes(), 1);
  f.connection.closed(new Error('private disconnect'));
  f.connection.closed(new Error('duplicate close'));
  assert.equal(f.timers.size, 1);
  assert.equal(f.runTimer(), 15000);
  await flush();
  assert.equal(f.connection.starts, 3);
  assert.equal(f.changes(), 2);
  f.cleanup();
});

test('cleanup clears pending retries, stops once and blocks events and reconnection callbacks', async () => {
  const f = fixture({ start: async () => { throw new Error('unavailable'); }, stop: async () => { throw new Error('transport already closed'); } });
  await flush();
  assert.equal(f.timers.size, 1);
  const statuses = f.statuses.length;
  const errors = f.errors.length;
  f.cleanup();
  f.cleanup();
  assert.equal(f.timers.size, 0);
  assert.equal(f.connection.stops, 1);
  f.event(event('200'));
  f.connection.reconnecting();
  f.connection.reconnected();
  f.connection.closed();
  await flush();
  assert.equal(f.statuses.length, statuses);
  assert.equal(f.errors.length, errors);
  assert.equal(f.changes(), 0);
  await assert.rejects(f.configuration.options.accessTokenFactory());
});

test('cleanup prevents late connection results from updating the previous owner', async () => {
  let completeStart;
  const f = fixture({ start: () => new Promise(resolve => { completeStart = resolve; }) });
  assert.deepEqual(f.statuses, ['connecting']);
  f.cleanup();
  completeStart();
  await flush();
  assert.deepEqual(f.statuses, ['connecting']);
  assert.equal(f.changes(), 0);
  assert.equal(f.connection.stops, 1);
  assert.equal(f.timers.size, 0);
});

test('a token obtained after account cleanup is rejected before reaching the old connection', async () => {
  let deliverToken;
  const f = fixture({ getAccessToken: () => new Promise(resolve => { deliverToken = resolve; }) });
  await flush();
  const pending = f.configuration.options.accessTokenFactory();
  f.cleanup();
  const rejected = assert.rejects(pending);
  deliverToken('token-from-a-later-session');
  await rejected;
  assert.equal(f.changes(), 1);
  assert.equal(f.connection.stops, 1);
});

test('synchronous builder failure returns a safe cleanup and a visible offline error', () => {
  const f = fixture({ buildError: true });
  assert.equal(typeof f.cleanup, 'function');
  assert.deepEqual(f.statuses, ['offline']);
  assert.equal(f.errors.length, 1);
  assert.ok(!f.errors[0].includes('private'));
  assert.equal(f.connection.starts, 0);
  f.cleanup();
  assert.equal(f.connection.stops, 0);
});
