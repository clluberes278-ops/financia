const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const file = path.resolve(__dirname, '../supabase/functions/_shared/bankMoney.ts');
const compiled = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const sandbox = { exports: {} };
vm.runInNewContext(compiled, sandbox, { filename: file });
const { parseBankAmount } = sandbox.exports;

test('bank amounts accept complete decimal formats and valid thousands groups', () => {
  for (const text of ['1,250.50', '1.250,50', '1250.50', '1250,50']) {
    assert.equal(parseBankAmount(text), 1250.5, text);
  }
  for (const [text, expected] of [
    ['1250', 1250], ['1', 1], ['0.01', 0.01], ['0,29', 0.29],
    ['12.3', 12.3], ['12,3', 12.3], [' 1250.50 ', 1250.5],
    ['1,234,567.89', 1234567.89], ['1.234.567,89', 1234567.89],
  ]) assert.equal(parseBankAmount(text), expected, text);
});

test('bank amounts reject ambiguous separators, invalid grouping and excess precision', () => {
  for (const text of [
    '1,250', '1.250', '12,345', '12.345', '1,000,000', '1.000.000',
    '1250.500', '1250,500', '0.001', '1,250.500', '1.250,500',
    '12,34.56', '12.34,56', '1234,567.89', '1234.567,89',
    '1,23,456.78', '1.23.456,78', '1,,250.50', '1..250,50',
    '1.234.56', '1,234,56', '.50', ',50', '1250.', '1250,',
  ]) assert.equal(parseBankAmount(text), null, text);
});

test('bank amounts never partially parse signs, currencies, scientific notation or garbage', () => {
  for (const text of [
    '', ' ', 'NaN', 'Infinity', '1e3', '0x10', '-12.50', '+12.50',
    '(12.50)', 'RD$ 12.50', 'USD12.50', '12.50USD', '12.50abc',
    'abc12.50', '1 250.50', '1\n250.50', '12\u0000', '１２.５０',
  ]) assert.equal(parseBankAmount(text), null, JSON.stringify(text));
});

test('bank amounts enforce positive safe cents and the exact supported upper boundary', () => {
  for (const text of ['999999999999.99', '999,999,999,999.99', '999.999.999.999,99']) {
    assert.equal(parseBankAmount(text), 999999999999.99, text);
  }
  assert.equal(parseBankAmount('999999999999.98'), 999999999999.98);
  for (const text of ['0', '0.00', '0,00', '1000000000000', '1000000000000.00',
    '9,999,999,999,999.99', '9007199254740991', '9'.repeat(400)]) {
    assert.equal(parseBankAmount(text), null, text);
  }
});
