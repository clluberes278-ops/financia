const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const { assertPublicSupabaseKey } = require('./validate-public-key.cjs');
const root = path.resolve(__dirname, '..');
const file = path.join(root, '.env');
const config = fs.existsSync(file) ? dotenv.parse(fs.readFileSync(file)) : {};
const environment = { ...process.env };
for (const name of ['FINANCIA_SUPABASE_URL', 'FINANCIA_SUPABASE_ANON_KEY', 'FINANCIA_API_URL']) environment[name] = process.env[name] ?? config[name] ?? '';
assertPublicSupabaseKey(environment.FINANCIA_SUPABASE_ANON_KEY);
const architectures = process.env.FINANCIA_ANDROID_ARCHITECTURES ?? 'arm64-v8a';
if (!/^(arm64-v8a|armeabi-v7a|x86_64|x86)(,(arm64-v8a|armeabi-v7a|x86_64|x86))*$/.test(architectures)) throw new Error('Arquitecturas Android no válidas.');
const digest = createHash('sha256').update(JSON.stringify([
  environment.FINANCIA_SUPABASE_URL, environment.FINANCIA_SUPABASE_ANON_KEY, environment.FINANCIA_API_URL,
])).digest('hex');
const destination = path.join(root, 'artifacts/android-preview');
const result = spawnSync('docker', ['build', '--platform', 'linux/amd64', '--file', 'Dockerfile.android', '--progress', 'plain',
  '--build-arg', 'FINANCIA_SUPABASE_URL=' + environment.FINANCIA_SUPABASE_URL,
  '--build-arg', 'FINANCIA_API_URL=' + environment.FINANCIA_API_URL,
  '--build-arg', 'PUBLIC_CONFIG_DIGEST=' + digest, '--build-arg', 'ANDROID_ARCHITECTURES=' + architectures,
  '--secret', 'id=supabase_public_key,env=FINANCIA_SUPABASE_ANON_KEY', '--output', 'type=local,dest=' + destination, '.'], {
  cwd: root, env: environment, stdio: 'inherit', windowsHide: true,
});
if (result.error) console.error(result.error.message);
if (result.status === 0) console.log(`APK preview (${architectures}): ${path.join(destination, 'financia-preview.apk')}\nFirma de desarrollo; no publicar en tiendas.`);
process.exit(result.status ?? 1);
