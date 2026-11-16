const configurationError = () => new Error('FINANCIA_SUPABASE_ANON_KEY debe ser una clave pública publishable o anon legacy. Nunca uses claves secretas, service_role ni tokens de usuario.');

function decodePart(part) {
  if (!/^[A-Za-z0-9_-]+$/.test(part)) throw configurationError();
  const bytes = Buffer.from(part, 'base64url');
  if (bytes.toString('base64url') !== part) throw configurationError();
  return bytes;
}

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

// Classifies configuration to catch privileged credentials copied by mistake.
// This does not verify a JWT signature or authenticate a user.
function assertPublicSupabaseKey(value, { required = false } = {}) {
  if (typeof value !== 'string' || value.trim() !== value) throw configurationError();
  if (value === '' && !required) return;
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(value)) return;
  if (value.length > 16384) throw configurationError();
  const parts = value.split('.');
  if (parts.length !== 3) throw configurationError();
  try {
    const header = JSON.parse(decodePart(parts[0]).toString('utf8'));
    const payload = JSON.parse(decodePart(parts[1]).toString('utf8'));
    decodePart(parts[2]);
    if (object(header) && typeof header.alg === 'string' && header.alg.length > 0 && header.alg !== 'none'
      && object(payload) && payload.role === 'anon') return;
  } catch {
    // Never attach the parse error: its message may contain the configured value.
    throw configurationError();
  }
  throw configurationError();
}

module.exports = { assertPublicSupabaseKey };
