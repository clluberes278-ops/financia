const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
// TypeScript en memoria, almacenamiento ficticio y ninguna conexión de red.
function loader(mocks = {}) {
  const cache = new Map();
  function load(file) {
    file = path.resolve(__dirname, '..', file);
    if (!path.extname(file)) file += '.ts';
    if (file.endsWith('.json')) return JSON.parse(fs.readFileSync(file, 'utf8'));
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const localRequire = name => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name === '@financia/api-client') return load('packages/api-client/index.ts');
      if (name.startsWith('.')) return load(path.relative(path.resolve(__dirname, '..'), path.resolve(path.dirname(file), name)));
      return require(name);
    };
    vm.runInThisContext('(function(require,module,exports){' + code + '\n})', { filename: file })(localRequire, module, module.exports);
    return module.exports;
  }
  return load;
}
function storage() {
  const values = new Map();
  let fail = false;
  return { values, failNext: () => { fail = true; }, getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => { if (fail) { fail = false; throw new Error('Disco lleno ficticio'); } values.set(key, value); } };
}
const transaction = (id, currency = 'DOP', amount = 1000, type = 'ingreso', category = 'salario') => ({ id, currency, amount, type, category, date: '2026-10-01T12:00:00.000Z' });
test('bolsillos rechazan saldos fuera de precisión o rango sin descartar el historial', () => {
  const { parseSnapshot } = loader()('utils/financialRepository.ts');
  const pocket = { id: 'p1', name: 'Viaje', emoji: '🎯', currency: 'DOP', targetAmount: 100, createdAt: '2026-11-01T12:00:00Z' };
  const snapshot = amount => JSON.stringify({ version: 1, transactions: [], pockets: [{ ...pocket, currentAmount: amount }] });
  for (const amount of [0, 0.1, 0.29, 100]) assert.equal(parseSnapshot(snapshot(amount)).pockets[0].currentAmount, amount);
  for (const amount of [-1, 0.001, 1000000000000]) assert.throws(() => parseSnapshot(snapshot(amount)));
});
function financialStore() {
  const disk = storage();
  const load = loader({ '@react-native-async-storage/async-storage': { __esModule: true, default: disk }, '../utils/supabase': { supabase: null }, '../utils/financeApi': { financeApiUrl: '' },
    '../utils/connectedFinanceSession': { connectFinanceSession: () => { throw new Error('El modo local no debe crear una sesión remota.'); } } });
  return { disk, store: load('store/useFinanceStore.ts').useFinanceStore };
}
test('cuentas e invitado aislados; historial ambiguo sin migrar ni borrar', async () => {
  const { disk, store } = financialStore();
  disk.values.set('@financia_transactions', '[{"id":"historial-anterior"}]');
  await store.getState().activateOwner('user:ana');
  assert.equal(store.getState().hasLegacyData, true);
  await store.getState().addTransaction(transaction('ignored'));
  await store.getState().activateOwner('user:luis');
  assert.equal(store.getState().transactions.length, 0);
  await store.getState().activateOwner('guest');
  assert.equal(store.getState().transactions.length, 0);
  await store.getState().clearAllData();
  assert.equal(disk.values.get('@financia_transactions'), '[{"id":"historial-anterior"}]');
  await store.getState().activateOwner('user:ana');
  assert.equal(store.getState().transactions.length, 1);
});
test('abono, retiro y eliminación consistentes; fallo conserva memoria y disco', async () => {
  const { disk, store } = financialStore();
  await store.getState().activateOwner('guest');
  await store.getState().addTransaction(transaction('income'));
  await store.getState().createPocket({ name: 'Viaje', targetAmount: 500, currency: 'DOP' });
  const id = store.getState().pockets[0].id;
  const before = JSON.stringify(store.getState().transactions);
  const diskBefore = new Map(disk.values);
  disk.failNext();
  await assert.rejects(store.getState().depositToPocket(id, 200));
  assert.equal(store.getState().pockets[0].currentAmount, 0);
  assert.equal(JSON.stringify(store.getState().transactions), before);
  assert.deepEqual(disk.values, diskBefore);
  await store.getState().depositToPocket(id, 200);
  assert.equal(store.getState().pockets[0].currentAmount, 200);
  assert.equal(store.getState().transactions[0].pocketId, id);
  await assert.rejects(store.getState().deleteTransaction(store.getState().transactions[0].id));
  await assert.rejects(store.getState().clearAllTransactions());
  await store.getState().withdrawFromPocket(id, 50);
  assert.equal(store.getState().pockets[0].currentAmount, 150);
  await store.getState().deletePocket(id);
  assert.equal(store.getState().pockets.length, 0);
  const balance = store.getState().transactions.reduce((sum, t) => sum + (t.type === 'ingreso' ? t.amount : -t.amount), 0);
  assert.equal(balance, 1000);
});
test('ahorro USD no consume DOP; dos abonos simultáneos no sobregiran', async () => {
  const { store } = financialStore();
  await store.getState().activateOwner('guest');
  await store.getState().addTransaction(transaction('income', 'DOP', 1000));
  await store.getState().createPocket({ name: 'USD', currency: 'USD', targetAmount: 100 });
  const id = store.getState().pockets[0].id;
  await assert.rejects(store.getState().depositToPocket(id, 10));
  await store.getState().addTransaction(transaction('usd', 'USD', 100));
  const results = await Promise.allSettled([store.getState().depositToPocket(id, 70), store.getState().depositToPocket(id, 70)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(store.getState().pockets[0].currentAmount, 70);
});
test('importación conserva DOP/USD, deduplica y rechaza otra cuenta', async () => {
  const { store } = financialStore();
  await store.getState().activateOwner('user:ana');
  const data = [transaction('gmail:bhd:usd', 'USD', 12, 'gasto', 'otros'), transaction('gmail:bhd:dop', 'DOP', 800)];
  await store.getState().importBankTransactions(data, 'user:ana');
  await store.getState().importBankTransactions(data, 'user:ana');
  assert.equal(store.getState().transactions.length, 2);
  assert.equal(store.getState().transactions.find(t => t.id.endsWith(':usd')).currency, 'USD');
  await store.getState().activateOwner('user:luis');
  await assert.rejects(store.getState().importBankTransactions(data, 'user:ana'));
  assert.equal(store.getState().transactions.length, 0);
});
test('operaciones en espera no aparecen después de cambiar cuenta', async () => {
  const { store } = financialStore();
  await store.getState().activateOwner('user:ana');
  const pending = store.getState().addTransaction(transaction('late'));
  const changed = store.getState().activateOwner('user:luis');
  await assert.rejects(pending);
  await changed;
  assert.equal(store.getState().owner, 'user:luis');
  assert.equal(store.getState().transactions.length, 0);
});
test('historial corrupto no se sobrescribe; montos inválidos se rechazan', async () => {
  const { disk, store } = financialStore();
  disk.values.set('@financia_finances_v1:guest', '{broken');
  await store.getState().activateOwner('guest');
  assert.equal(store.getState().isLoaded, false);
  assert.ok(store.getState().error);
  await assert.rejects(store.getState().addTransaction(transaction('invalid')));
  assert.equal(disk.values.get('@financia_finances_v1:guest'), '{broken');
  await store.getState().activateOwner('user:test');
  for (const amount of [NaN, Infinity, -1, 0, 1.001]) await assert.rejects(store.getState().addTransaction(transaction('bad', 'DOP', amount)));
});
test('informes excluyen transferencias internas y cuentan días inclusive', () => {
  const c = loader()('utils/calculations.ts');
  const data = [transaction('salary'), transaction('food', 'DOP', 100, 'gasto', 'comida'), transaction('saving', 'DOP', 400, 'gasto', 'ahorro'), transaction('withdraw', 'DOP', 50, 'ingreso', 'ahorro')];
  assert.equal(c.calculateTotalIncome(data), 1000);
  assert.equal(c.calculateTotalExpenses(data), 100);
  assert.equal(c.groupExpensesByCategory(data).reduce((sum, row) => sum + row.total, 0), 100);
  assert.equal(c.getHighestExpense(data).id, 'food');
  assert.equal(c.countCalendarDays(new Date(2026, 9, 1), new Date(2026, 9, 1)), 1);
  assert.equal(c.countCalendarDays(new Date(2026, 9, 1), new Date(2026, 9, 30)), 30);
  assert.equal(c.countCalendarDays(new Date(2024, 1, 1), new Date(2024, 1, 29)), 29);
  assert.match(c.formatCurrency(5, 'USD'), /USD/);
});
test('CSV móvil usa API válida, incluye moneda y escapa notas', async () => {
  let written; let shared;
  const load = loader({ './fileSharing': { shareTextFile: async (uri, text) => { written = { uri, text }; shared = uri; } } });
  await load('utils/export.ts').exportTransactionsToCSV([{ ...transaction('csv', 'USD'), note: 'Nota, con "comillas"' }]);
  assert.match(written.text, /Monto,Moneda,Nota/);
  assert.match(written.text, /1000.00,USD,"Nota, con ""comillas"""/);
  assert.equal(shared, written.uri);
});

test('montos ambiguos no se interpretan parcialmente', () => {
  const { parseMoney } = loader()('utils/money.ts');
  assert.equal(parseMoney('100,25'), 100.25);
  assert.equal(parseMoney('0.10'), 0.1);
  for (const input of ['1.2.3', '1,000', '12abc', '', 'Infinity', '1e3']) assert.ok(Number.isNaN(parseMoney(input)));
});
test('PDF usa una sola moneda, excluye traspasos y escapa el texto de notas', async () => {
  let html; let shared;
  const load = loader({ './fileSharing': { sharePdf: async (content, title) => { html = content; shared = title; } } });
  const data = [transaction('dop', 'DOP', 9999), { ...transaction('usd', 'USD', 10), note: '<b>texto</b>' }, transaction('saving', 'USD', 2, 'ingreso', 'ahorro')];
  await load('utils/generatePdf.ts').exportReportAsPdf(data, 2026, 9, 'Prueba', 'USD');
  assert.match(html, /USD/);
  assert.doesNotMatch(html, /9[,.]999/);
  assert.match(html, /&lt;b&gt;texto&lt;\/b&gt;/);
  assert.equal(shared, 'Informe Financia - Octubre de 2026');
});
test('respaldo conserva exactamente los datos originales sin asumir propietario o moneda', async () => {
  const originals = ['[{"amount":12.34}]', '[{"name":"Meta antigua"}]'];
  let backup;
  const load = loader({ '@react-native-async-storage/async-storage': { __esModule: true, default: { getItem: async key => originals[key.includes('transactions') ? 0 : 1] } },
    './fileSharing': { shareTextFile: async (_, value) => { backup = JSON.parse(value); } } });
  await load('utils/legacyArchive.ts').exportLegacyArchive();
  assert.equal(backup.owner, null);
  assert.equal(backup.currency, null);
  assert.deepEqual(backup.entries.map(entry => entry.raw), originals);
});

test('API importa solo historial propio a servidor vacío y conserva el original local', async () => {
  const load = loader();
  const disk = storage();
  const local = load('utils/financialRepository.ts').createFinancialRepository(disk);
  await local.update('user:ana', current => ({ ...current, transactions: [transaction('original')] }));
  let remote = { revision: 0, snapshot: { version: 1, transactions: [], pockets: [] } };
  const requests = [];
  const repository = load('utils/remoteFinanceRepository.ts').createRemoteFinanceRepository(local, async (owner, method, body) => {
    requests.push({ owner, method });
    if (method === 'PUT') {
      const payload = JSON.parse(body);
      assert.equal(payload.expectedRevision, remote.revision);
      remote = { revision: remote.revision + 1, snapshot: payload.snapshot };
    }
    return remote;
  });
  assert.equal((await repository.read('user:ana')).transactions[0].id, 'original');
  assert.equal(remote.revision, 1);
  await repository.update('user:ana', current => ({ ...current, transactions: [] }));
  assert.equal((await repository.read('user:ana')).transactions.length, 0);
  assert.equal((await local.read('user:ana')).transactions[0].id, 'original');
  const count = requests.length;
  await repository.read('guest');
  assert.equal(requests.length, count);
});

test('API rechaza respuestas corruptas y no transforma fallos de red en historial vacío', async () => {
  const load = loader();
  const local = load('utils/financialRepository.ts').createFinancialRepository(storage());
  const factory = load('utils/remoteFinanceRepository.ts').createRemoteFinanceRepository;
  await assert.rejects(factory(local, async () => ({ revision: 1, snapshot: null })).read('user:ana'));
  await assert.rejects(factory(local, async () => { throw new Error('Sin conexión'); }).read('user:ana'), /Sin conexión/);
});

test('adaptador nativo escribe UTF-8 y comparte archivos sin fallar al cancelar', async () => {
  let written; let shared;
  const load = loader({
    'react-native-blob-util': { __esModule: true, default: { fs: { dirs: { CacheDir: '/cache' }, writeFile: async (...args) => { written = args; } } } },
    'react-native-share': { __esModule: true, default: { open: async options => { shared = options; } } },
    'react-native-html-to-pdf': { generatePDF: async () => ({ filePath: '/cache/report.pdf' }) }
  });
  const files = load('utils/fileSharing.ts');
  await files.shareTextFile('report.csv', 'á,USD', 'text/csv', 'Informe');
  assert.deepEqual(written, ['/cache/report.csv', 'á,USD', 'utf8']);
  assert.equal(shared.url, 'file:///cache/report.csv');
  assert.equal(shared.failOnCancel, false);
  await files.sharePdf('<h1>Informe</h1>', 'Informe');
  assert.equal(shared.url, 'file:///cache/report.pdf');
  assert.equal(shared.type, 'application/pdf');
});
