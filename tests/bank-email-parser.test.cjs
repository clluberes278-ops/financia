const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(file) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const localRequire = name => load(path.resolve(path.dirname(file), name));
  vm.runInThisContext('(function(require,module,exports){' + code + '\n})', { filename: file })(localRequire, module, module.exports);
  return module.exports;
}
const { parseGenericBankEmail } = load(path.resolve(__dirname, '../supabase/functions/_shared/genericBankEmailParser.ts'));
// Synthetic fixtures validate numeric parsing only; they do not certify a bank's real email format.
const notice = body => ({ gmailMessageId: 'synthetic-1', sender: 'alertas@bhd.com.do', subject: 'Compra aprobada', body });

test('correo conserva decimales y reconoce moneda junto al importe', () => {
  for (const formatted of ['DOP 1,250.50', 'RD$ 1.250,50', 'DOP 1250.50', 'DOP 1250,50']) {
    const result = parseGenericBankEmail(notice(`${formatted}\n2026-11-01`));
    assert.equal(result.amount, 1250.50);
    assert.equal(result.currency, 'DOP');
  }
  assert.equal(parseGenericBankEmail(notice('US$ 25.50\n2026-11-01')).currency, 'USD');
  assert.equal(parseGenericBankEmail(notice('DOP 250.00\nTambién tienes una cuenta USD.\n2026-11-01')).currency, 'DOP');
});

test('correo no usa números sueltos, moneda ambigua ni múltiples montos diferentes', () => {
  for (const body of [
    'Tarjeta 1234\n2026-11-01', '$ 250.00\n2026-11-01',
    'DOP 1,250\n2026-11-01', 'DOP 250.001\n2026-11-01',
    'DOP -250.00\n2026-11-01', 'DOP 250.00abc\n2026-11-01',
    'DOP 250.00\nSaldo DOP 5,000.00\n2026-11-01',
    'DOP 250.00\nUSD 250.00\n2026-11-01',
  ]) assert.equal(parseGenericBankEmail(notice(body)), null, body);
});
