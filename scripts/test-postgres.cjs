const { spawn, spawnSync } = require('node:child_process');
const { randomBytes, randomUUID } = require('node:crypto');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const container = `financia-test-${randomUUID()}`;
const password = randomBytes(32).toString('hex');
let interrupted = false;
let testProcess;

function docker(args, options = {}) {
  const result = spawnSync('docker', args, {
    cwd: root, encoding: 'utf8', windowsHide: true, timeout: 30000,
    stdio: ['ignore', 'pipe', 'pipe'], ...options,
  });
  if (result.error || result.status !== 0) {
    throw new Error('Docker no pudo completar la operación. Comprueba que Docker Desktop esté iniciado y que pueda descargar postgres:18-alpine.');
  }
  return result.stdout.trim();
}

function stopTests() {
  if (!testProcess || testProcess.exitCode !== null) return;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(testProcess.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
  } else {
    try { process.kill(-testProcess.pid, 'SIGTERM'); } catch (error) {
      if (error.code !== 'ESRCH') throw error;
    }
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    interrupted = true;
    stopTests();
  });
}

async function main() {
  try {
    docker(['info', '--format', '{{.ServerVersion}}']);
  } catch {
    throw new Error('Docker no está disponible. Inicia Docker Desktop y vuelve a ejecutar npm run api:test:postgres.');
  }
  if (interrupted) return 130;
  try {
    console.log('Preparando PostgreSQL 18 temporal y aislado para las pruebas...');
    // Never read .env or reuse development containers, credentials or volumes.
    docker(['run', '--detach', '--name', container, '--label', 'financia.purpose=isolated-tests',
      '--publish', '127.0.0.1::5432', '--tmpfs', '/var/lib/postgresql',
      '--env', 'POSTGRES_USER=financia_test', '--env', 'POSTGRES_DB=postgres',
      '--env', 'POSTGRES_PASSWORD', 'postgres:18-alpine'], {
      env: { ...process.env, POSTGRES_PASSWORD: password }, timeout: 180000,
    });
    const deadline = Date.now() + 60000;
    let ready = false;
    while (!interrupted && Date.now() < deadline) {
      try {
        docker(['exec', container, 'pg_isready', '-h', '127.0.0.1', '-U', 'financia_test', '-d', 'postgres']);
        ready = true;
        break;
      } catch {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    if (interrupted) return 130;
    if (!ready) throw new Error('PostgreSQL de pruebas no estuvo listo en 60 segundos.');
    const binding = docker(['port', container, '5432/tcp']);
    const match = /^127\.0\.0\.1:(\d+)$/.exec(binding);
    if (!match) throw new Error('Docker no asignó un puerto local exclusivo para las pruebas.');
    const connection = `Host=127.0.0.1;Port=${match[1]};Database=postgres;Username=financia_test;Password=${password};Pooling=false`;
    console.log('Ejecutando pruebas HTTP contra PostgreSQL temporal...');
    return await new Promise((resolve, reject) => {
      testProcess = spawn(process.execPath, [path.join(__dirname, 'run-api.cjs'), 'test', ...process.argv.slice(2)], {
        cwd: root, stdio: 'inherit', detached: process.platform !== 'win32',
        env: { ...process.env, FINANCIA_TEST_POSTGRES: connection }, windowsHide: true,
      });
      testProcess.once('error', reject);
      testProcess.once('exit', code => resolve(interrupted ? 130 : (code ?? 1)));
    });
  } finally {
    // The UUID name belongs to this invocation only; never prune or use compose down.
    docker(['rm', '--force', '--volumes', container]);
    console.log('PostgreSQL temporal eliminado.');
  }
}

main().then(code => { process.exitCode = code; }).catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
