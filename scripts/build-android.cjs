const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const mode = process.argv[2] ?? 'preview';
const tasks = { debug: 'assembleDebug', preview: 'assemblePreview', release: 'assembleRelease', bundle: 'bundleRelease' };
if (!Object.hasOwn(tasks, mode)) throw new Error('Variante esperada: debug, preview, release o bundle.');
if (mode === 'release' || mode === 'bundle') {
  const required = ['FINANCIA_RELEASE_STORE_FILE', 'FINANCIA_RELEASE_STORE_PASSWORD', 'FINANCIA_RELEASE_KEY_ALIAS', 'FINANCIA_RELEASE_KEY_PASSWORD'];
  if (required.some(name => !process.env[name])) {
    console.error('Configura las cuatro variables FINANCIA_RELEASE_* de firma. Para instalar una prueba sin Metro usa npm run mobile:apk:preview.');
    process.exit(1);
  }
  if (!path.isAbsolute(process.env.FINANCIA_RELEASE_STORE_FILE) || !fs.existsSync(process.env.FINANCIA_RELEASE_STORE_FILE)) {
    console.error('FINANCIA_RELEASE_STORE_FILE debe ser una ruta absoluta a tu keystore de producción existente.');
    process.exit(1);
  }
}
const environment = { ...process.env };
const java = environment.JAVA_HOME ? path.join(environment.JAVA_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java') : 'java';
const probe = spawnSync(java, ['-version'], { stdio: 'ignore', windowsHide: true });
if (probe.status !== 0) {
  console.error('Falta un JDK compatible. Configura JAVA_HOME y Android SDK, o usa npm run mobile:apk:docker para generar el APK de prueba en Docker.');
  process.exit(1);
}
if (environment.JAVA_HOME) environment.PATH = path.join(environment.JAVA_HOME, 'bin') + path.delimiter + environment.PATH;
environment.GRADLE_USER_HOME ??= path.join(root, 'artifacts/gradle-home');
const directory = path.join(root, 'apps/mobile/android');
const args = [tasks[mode], '--no-daemon', ...process.argv.slice(3)];
const result = process.platform === 'win32'
  ? spawnSync('cmd.exe', ['/d', '/c', 'gradlew.bat', ...args], { cwd: directory, env: environment, stdio: 'inherit', windowsHide: true })
  : spawnSync('sh', ['./gradlew', ...args], { cwd: directory, env: environment, stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
