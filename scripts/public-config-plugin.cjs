// Only these public values may be embedded in the mobile/web bundle.
const dotenv = require('dotenv');
const path = require('node:path');
const fs = require('node:fs');
const { assertPublicSupabaseKey } = require('./validate-public-key.cjs');
module.exports = function ({ types: t }) {
  const file = path.resolve(__dirname, '../.env');
  const env = fs.existsSync(file) ? dotenv.parse(fs.readFileSync(file)) : {};
  assertPublicSupabaseKey(process.env.FINANCIA_SUPABASE_ANON_KEY ?? env.FINANCIA_SUPABASE_ANON_KEY ?? '');
  const allowed = new Set(['FINANCIA_SUPABASE_URL', 'FINANCIA_SUPABASE_ANON_KEY', 'FINANCIA_API_URL']);
  return {
    visitor: {
      MemberExpression(p) {
        const n = p.node;
        if (!n.computed && t.isIdentifier(n.property) && allowed.has(n.property.name)
          && t.isMemberExpression(n.object) && !n.object.computed
          && t.isIdentifier(n.object.object, { name: 'process' }) && t.isIdentifier(n.object.property, { name: 'env' })) {
          const value = process.env[n.property.name] ?? env[n.property.name] ?? '';
          // Babel can cache this plugin instance across builds. Validate the exact
          // value being emitted, including an environment override changed later.
          if (n.property.name === 'FINANCIA_SUPABASE_ANON_KEY') assertPublicSupabaseKey(value);
          p.replaceWith(t.stringLiteral(value));
        }
      },
    },
  };
};
