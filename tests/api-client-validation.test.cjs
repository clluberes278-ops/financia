const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');
const contract = require('../packages/api-client/openapi.json');
const moduleFile = path.resolve(__dirname, '../packages/api-client/validation.ts');
const source = ts.transpileModule(fs.readFileSync(moduleFile, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const target = { exports: {} };
vm.runInThisContext('(function(require,module,exports){' + source + '\n})', { filename: moduleFile })(() => contract, target, target.exports);
const { validateResponse, validateSchema } = target.exports;

test('response validation enforces canonical money and explicit valid dates without converting values', () => {
  const movement = { id: 'm', currency: 'DOP', amount: '1250.50', type: 'gasto', category: 'comida', date: '2026-11-15T12:00:00Z', version: '1' };
  const original = JSON.stringify(movement);
  assert.equal(validateResponse('V2Movement', movement), true);
  assert.equal(JSON.stringify(movement), original);
  for (const amount of ['0.00', '-1.00', '1.001', '1', '1000000000000.00', 1250.50])
    assert.equal(validateResponse('V2Movement', { ...movement, amount }), false, String(amount));
  for (const date of ['yesterday', '2026-02-30T12:00:00Z', '2026-11-15T12:00:00', '2026-11-15T25:00:00Z'])
    assert.equal(validateResponse('V2Movement', { ...movement, date }), false, date);
});

test('schema validation handles unions, references, required fields and additional properties', () => {
  const schema = { type: 'object', required: ['payload'], properties: { payload: { anyOf: [{ type: 'string', enum: ['yes'] }, { type: 'null' }] } }, additionalProperties: false };
  assert.equal(validateSchema(schema, { payload: 'yes' }), true);
  assert.equal(validateSchema(schema, { payload: null }), true);
  assert.equal(validateSchema(schema, { payload: 'no' }), false);
  assert.equal(validateSchema(schema, {}), false);
  assert.equal(validateSchema(schema, { payload: null, extra: true }), false);
  assert.equal(validateResponse('constructor', {}), false);
  assert.equal(validateSchema({ $ref: 'https://untrusted.example/schema' }, {}), false);
  assert.equal(validateSchema({ type: 'object', unevaluatedProperties: false }, {}), false);
});

test('schema validation rejects non-JSON values, cycles and getters without executing them', () => {
  const schema = { type: 'object' };
  const cycle = {}; cycle.self = cycle;
  let getterCalls = 0;
  const accessor = { get value() { getterCalls++; return 1; } };
  for (const value of [new Date(), cycle, accessor, { missing: undefined }, { value: Infinity }, { value: () => {} }])
    assert.equal(validateSchema(schema, value), false);
  assert.equal(getterCalls, 0);
});

test('schema validation applies numeric, collection and string assertions', () => {
  assert.equal(validateSchema({ type: 'number', minimum: 1, maximum: 3, multipleOf: 0.5 }, 2.5), true);
  assert.equal(validateSchema({ type: 'integer' }, 2.5), false);
  assert.equal(validateSchema({ type: 'array', items: { type: 'string', minLength: 2 }, maxItems: 2 }, ['ab', 'cd']), true);
  assert.equal(validateSchema({ type: 'array', items: { type: 'string', minLength: 2 } }, ['a']), false);
  assert.equal(validateSchema({ oneOf: [{ type: 'number' }, { type: 'integer' }] }, 1), false);
  assert.equal(validateSchema({ allOf: [{ type: 'string' }, { pattern: '^ok$' }] }, 'ok'), true);
});
