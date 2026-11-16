const { spawnSync } = require('node:child_process');
const { randomBytes, createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const dotenv = require('dotenv');
const { checkLocalPort } = require('./check-local-port.cjs');
const { assertPublicSupabaseKey } = require('./validate-public-key.cjs');

const root = path.resolve(__dirname, '..');
const localFile = path.join(root, '.env.docker');
const mode = process.argv[2] ?? 'up';
const commands = {
  up: ['up', '--build', '--detach', '--wait', '--wait-timeout', '180'],
  stop: ['down'], // Retain the named database volume.
  logs: ['logs', '--tail', '100'],
  status: ['ps'],
  config: ['config', '--quiet'], // Do not print resolved credentials.
  lint: ['build', '--check'],
};

function docker(args, environment, stdio = 'inherit') {
  const result = spawnSync('docker', ['compose', '--project-name', 'financia-dev', '--project-directory', root,
    '--file', path.join(root, 'compose.yaml'), '--env-file', localFile, ...args], {
    cwd: root, env: environment, stdio, windowsHide: true, encoding: 'utf8',
  });
  if (result.error) throw new Error(`No se pudo ejecutar Docker: ${result.error.message}`);
  if (result.status !== 0) throw new Error('Docker no completó la operación. Revisa el mensaje anterior y que Docker Desktop esté iniciado.');
  return result.stdout;
}

function ensureEngine() {
  const probe = spawnSync('docker', ['info', '--format', '{{.ServerVersion}}'], {
    stdio: 'ignore', windowsHide: true, timeout: 10000,
  });
  if (probe.status === 0) return;
  if (probe.error?.code === 'ENOENT') throw new Error('Instala Docker Desktop e inícialo con contenedores Linux.');
  if (process.platform === 'win32') {
    console.log('El motor no está disponible. Iniciando Docker Desktop...');
    const started = spawnSync('docker', ['desktop', 'start', '--timeout', '60'], {
      stdio: 'inherit', windowsHide: true, timeout: 65000,
    });
    if (started.status === 0) return;
  }
  throw new Error('Inicia Docker Desktop con contenedores Linux y vuelve a ejecutar npm run docker:up.');
}

async function main() {
  if (!Object.hasOwn(commands, mode) && mode !== 'verify') throw new Error('Modo esperado: up, stop, logs, status, config, lint o verify.');
  if (!fs.existsSync(localFile)) {
    if (mode !== 'up' && mode !== 'config') throw new Error('Primero ejecuta npm run docker:up.');
    fs.writeFileSync(localFile, `# Configuración local privada. No versionar ni borrar mientras uses su volumen.\nFINANCIA_DB_PASSWORD=${randomBytes(32).toString('hex')}\nFINANCIA_DOCKER_API_PORT=5081\nFINANCIA_DOCKER_WEB_PORT=8080\n`, { flag: 'wx', mode: 0o600 });
    console.log('Preparada .env.docker con una contraseña local aleatoria.');
  }
  const publicFile = path.join(root, '.env');
  const publicConfig = fs.existsSync(publicFile) ? dotenv.parse(fs.readFileSync(publicFile)) : {};
  const saved = dotenv.parse(fs.readFileSync(localFile));
  const environment = { ...process.env };
  for (const key of ['FINANCIA_SUPABASE_URL', 'FINANCIA_SUPABASE_ANON_KEY']) {
    environment[key] = process.env[key] ?? publicConfig[key] ?? '';
  }
  for (const key of ['FINANCIA_DB_PASSWORD', 'FINANCIA_DOCKER_API_PORT', 'FINANCIA_DOCKER_WEB_PORT']) {
    environment[key] = process.env[key] ?? saved[key] ?? '';
  }
  if (!/^[a-f0-9]{64}$/.test(environment.FINANCIA_DB_PASSWORD)) {
    throw new Error('La contraseña local debe conservar los 64 caracteres hexadecimales generados en .env.docker.');
  }
  for (const key of ['FINANCIA_DOCKER_API_PORT', 'FINANCIA_DOCKER_WEB_PORT']) {
    if (!/^\d+$/.test(environment[key]) || Number(environment[key]) < 1024 || Number(environment[key]) > 65535)
      throw new Error(`Puerto inválido en ${key}. Usa un número entre 1024 y 65535.`);
  }
  if (environment.FINANCIA_DOCKER_API_PORT === environment.FINANCIA_DOCKER_WEB_PORT)
    throw new Error('La web y la API necesitan puertos distintos.');
  if (['up', 'config', 'lint'].includes(mode)) assertPublicSupabaseKey(environment.FINANCIA_SUPABASE_ANON_KEY, { required: true });
  environment.FINANCIA_PUBLIC_CONFIG_DIGEST = createHash('sha256').update(JSON.stringify([
    environment.FINANCIA_SUPABASE_URL, environment.FINANCIA_SUPABASE_ANON_KEY,
    `http://127.0.0.1:${environment.FINANCIA_DOCKER_API_PORT}`,
  ])).digest('hex');
  if (mode === 'verify') {
    const api = `http://127.0.0.1:${environment.FINANCIA_DOCKER_API_PORT}`;
    const web = `http://127.0.0.1:${environment.FINANCIA_DOCKER_WEB_PORT}`;
    for (const [url, status, options] of [
      [api + '/health', 200], [web + '/healthz', 200], [web + '/', 200],
      [api + '/api/v2/finances', 401, { headers: { Origin: web } }],
      [api + '/hubs/finances/negotiate?negotiateVersion=1', 401, { method: 'POST', headers: { Origin: web } }],
    ]) {
      const response = await fetch(url, { ...options, signal: AbortSignal.timeout(10000) });
      if (response.status !== status) throw new Error(`Comprobación fallida: ${new URL(url).pathname}, HTTP ${response.status}.`);
      if (options && response.headers.get('access-control-allow-origin') !== web) throw new Error('El origen web no está habilitado en CORS.');
      if (url === web + '/' && !(await response.text()).includes('<title>Financia</title>')) throw new Error('La página servida no es Financia.');
      console.log(`${new URL(url).pathname}: HTTP ${status}, correcto.`);
    }
    const tables = docker(['exec', '-T', 'db', 'psql', '-U', 'financia', '-d', 'financia', '-Atc',
      "SELECT count(*) FROM information_schema.tables WHERE table_schema='financia' AND table_name IN ('finance_accounts','movements','pockets','command_receipts','finance_outbox','__FinanciaV2MigrationsHistory');"], environment, ['ignore', 'pipe', 'inherit']);
    if (tables.trim() !== '6') throw new Error('Faltan tablas de la API v2 en PostgreSQL.');
    console.log('PostgreSQL: las seis tablas de v2 están disponibles.');
    return;
  }
  if (mode === 'up') {
    ensureEngine();
    const running = docker(['ps', '--status', 'running', '--services'], environment, ['ignore', 'pipe', 'inherit']).trim().split(/\r?\n/);
    if (!running.includes('web')) await checkLocalPort(Number(environment.FINANCIA_DOCKER_WEB_PORT));
    if (!running.includes('api')) await checkLocalPort(Number(environment.FINANCIA_DOCKER_API_PORT));
  }
  docker(commands[mode], environment);
  if (mode === 'up') console.log(`Financia: http://127.0.0.1:${environment.FINANCIA_DOCKER_WEB_PORT}\nAPI: http://127.0.0.1:${environment.FINANCIA_DOCKER_API_PORT}\nComprobar: npm run docker:verify. Detener conservando datos: npm run docker:stop.`);
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
