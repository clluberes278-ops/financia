const test = require('node:test');
const assert = require('node:assert/strict');
const { assertPublicSupabaseKey } = require('../scripts/validate-public-key.cjs');
const { transformSync } = require('@babel/core');
const publicConfigPlugin = require('../scripts/public-config-plugin.cjs');

const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const signature = Buffer.from('fictional-signature-not-an-authentication-token').toString('base64url');
const jwt = (payload, header = { alg: 'HS256', typ: 'JWT' }) => `${encode(header)}.${encode(payload)}.${signature}`;

test('public configuration accepts publishable keys and legacy anon shape, with empty optional configuration', () => {
  assert.doesNotThrow(() => assertPublicSupabaseKey(''));
  assert.doesNotThrow(() => assertPublicSupabaseKey('sb_publishable_fictional_Public-123', { required: true }));
  assert.doesNotThrow(() => assertPublicSupabaseKey(jwt({ role: 'anon', iss: 'fictional-test' }), { required: true }));
  assert.throws(() => assertPublicSupabaseKey('', { required: true }), /clave pública/);
});

test('public configuration rejects secrets, user tokens and malformed JWTs without revealing their contents', () => {
  const invalid = [
    'sb_secret_DO_NOT_PRINT_THIS_FICTIONAL_VALUE',
    jwt({ role: 'service_role', marker: 'PRIVATE_FICTIONAL_MARKER' }),
    jwt({ role: 'authenticated' }), jwt({ sub: 'fictional-user' }),
    'sb_publishable_', ' sb_publishable_fictional', 'sb_publishable_fictional ', ' ', '\n',
    jwt(['anon']), jwt(null), jwt({ role: 'anon' }, []), jwt({ role: 'anon' }, { alg: 'none' }),
    jwt({ role: 'anon' }, {}), 'only.two', jwt({ role: 'anon' }) + '.extra',
    `${encode({ alg: 'HS256' })}.${Buffer.from('{bad-json-sensitive-marker').toString('base64url')}.${signature}`,
    `${encode({ alg: 'HS256' })}.${encode({ role: 'anon' })}.not-valid-signature!`,
    `${encode({ alg: 'HS256' })}.${encode({ role: 'anon' })}.`,
    `${encode({ alg: 'HS256' })}.${encode({ role: 'anon' })}.A`,
    'x'.repeat(16385), undefined, null, false, 123, {}, [],
  ];
  for (const value of invalid) {
    assert.throws(() => assertPublicSupabaseKey(value), error => {
      assert.equal(error.message.includes('DO_NOT_PRINT'), false);
      assert.equal(error.message.includes('PRIVATE_FICTIONAL_MARKER'), false);
      assert.equal(error.message.includes('bad-json-sensitive-marker'), false);
      if (typeof value === 'string' && value.trim().length > 1) assert.equal(error.message.includes(value), false);
      assert.equal(error.cause, undefined);
      return true;
    });
  }
});

test('Babel only embeds public configuration and rejects privileged credentials before emitting a bundle', () => {
  const variable = 'FINANCIA_SUPABASE_ANON_KEY';
  const canaryVariable = 'FINANCIA_SERVER_ONLY_TEST_CANARY';
  const original = process.env[variable];
  const originalCanary = process.env[canaryVariable];
  const canary = 'PRIVATE_ENV_CANARY_NEVER_EMBED';
  const transform = () => transformSync(`export const publicKey = process.env.${variable}; export const serverOnly = process.env.${canaryVariable};`, {
    configFile: false, babelrc: false, plugins: [publicConfigPlugin],
  });
  try {
    process.env[canaryVariable] = canary;
    for (const value of ['sb_publishable_fictional_test', jwt({ role: 'anon' })]) {
      process.env[variable] = value;
      const { code } = transform();
      assert.ok(code.includes(value));
      assert.equal(code.includes(canary), false);
      assert.ok(code.includes(`process.env.${canaryVariable}`));
    }
    for (const value of ['sb_secret_PRIVILEGED_FICTIONAL_CONFIG', jwt({ role: 'service_role' })]) {
      process.env[variable] = value;
      assert.throws(transform, error => {
        assert.match(error.message, /clave pública/);
        assert.equal(error.message.includes(value), false);
        assert.equal(error.message.includes(canary), false);
        return true;
      });
    }
  } finally {
    if (original === undefined) delete process.env[variable]; else process.env[variable] = original;
    if (originalCanary === undefined) delete process.env[canaryVariable]; else process.env[canaryVariable] = originalCanary;
  }
});
