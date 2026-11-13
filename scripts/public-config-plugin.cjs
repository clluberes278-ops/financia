// Only these public values may be embedded in the mobile/web bundle.
const dotenv = require('dotenv');
const path = require('node:path');
const fs = require('node:fs');
module.exports = function ({ types: t }) {
  const file = path.resolve(__dirname, '../.env');
  const env = fs.existsSync(file) ? dotenv.parse(fs.readFileSync(file)) : {};
  const allowed = new Set(['FINANCIA_SUPABASE_URL', 'FINANCIA_SUPABASE_ANON_KEY', 'FINANCIA_API_URL']);
  return {
    visitor: {
      MemberExpression(p) {
        const n = p.node;
        if (!n.computed && t.isIdentifier(n.property) && allowed.has(n.property.name)
          && t.isMemberExpression(n.object) && !n.object.computed
          && t.isIdentifier(n.object.object, { name: 'process' }) && t.isIdentifier(n.object.property, { name: 'env' })) {
          p.replaceWith(t.stringLiteral(process.env[n.property.name] ?? env[n.property.name] ?? ''));
        }
      },
    },
  };
};
