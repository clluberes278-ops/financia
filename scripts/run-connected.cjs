const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const { checkLocalPort } = require('./check-local-port.cjs');

async function main() {
  const root = path.resolve(__dirname, '..');
  const mode = process.argv[2];
  const modes = new Set(['api', 'web', 'android']);
  if (!modes.has(mode)) throw new Error('Modo esperado: api, web o android.');
  const file = path.join(root, '.env');
  const config = fs.existsSync(file) ? dotenv.parse(fs.readFileSync(file)) : {};
  const environment = { ...process.env };
  let entry;
  let args;
  let workingDirectory = root;
  if (mode === 'api') {
    const identityUrl = environment.Authentication__SupabaseUrl || environment.FINANCIA_SUPABASE_URL || config.FINANCIA_SUPABASE_URL;
    const publicKey = environment.Authentication__PublishableKey || environment.FINANCIA_SUPABASE_ANON_KEY || config.FINANCIA_SUPABASE_ANON_KEY;
    if (!identityUrl || !publicKey) throw new Error('Configura la URL y clave pública de Supabase en .env para iniciar la API conectada.');
    const artifacts = path.join(root, 'artifacts');
    fs.mkdirSync(artifacts, { recursive: true });
    Object.assign(environment, {
      ASPNETCORE_ENVIRONMENT: 'Development', ASPNETCORE_URLS: 'http://127.0.0.1:5080',
      FinanceV2__Enabled: 'true', Authentication__SupabaseUrl: identityUrl, Authentication__PublishableKey: publicKey,
      'Logging__LogLevel__Microsoft.EntityFrameworkCore.Database.Command': 'Warning',
      // This shortcut always uses an isolated local database, never a configured hosted connection.
      ConnectionStrings__Postgres: '', ConnectionStrings__Sqlite: 'Data Source=' + path.join(artifacts, 'connected-dev.db'),
    });
    entry = path.join(root, 'scripts/run-api.cjs');
    args = ['run', '--no-launch-profile'];
  } else {
    environment.FINANCIA_API_URL = mode === 'android' ? 'http://10.0.2.2:5080' : 'http://127.0.0.1:5080';
    entry = mode === 'web' ? require.resolve('webpack-cli/bin/cli.js') : path.join(root, 'node_modules/react-native/cli.js');
    if (mode === 'android') workingDirectory = path.join(root, 'apps/mobile');
    args = mode === 'web' ? ['serve', '--mode', 'development'] : ['run-android'];
    if (mode === 'web') {
      const extra = process.argv.slice(3);
      const portArgument = extra.find(value => value.startsWith('--port='))?.slice('--port='.length)
        ?? (extra.includes('--port') ? extra[extra.indexOf('--port') + 1] : '8080');
      if (/^\d+$/.test(portArgument ?? '')) await checkLocalPort(Number(portArgument));
    }
  }
  // Foreground terminal process. No credentials are printed or embedded beyond the existing public-config allowlist.
  const result = spawnSync(process.execPath, [entry, ...args, ...process.argv.slice(3)], {
    cwd: workingDirectory, stdio: 'inherit', env: environment, windowsHide: true,
  });
  if (result.error) console.error(result.error.message);
  process.exit(result.status ?? 1);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
