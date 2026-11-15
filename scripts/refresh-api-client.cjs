const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const check = process.argv.includes('--check');
const artifacts = path.join(root, 'artifacts');
fs.mkdirSync(artifacts, { recursive: true });
const directory = fs.mkdtempSync(path.join(artifacts, 'api-contract-check-'));
const output = path.join(directory, 'openapi.json');
function run(file, args) {
  const result = spawnSync(process.execPath, [file, ...args], { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('API generation failed: ' + file);
}
try {
  // Offline export exits before starting ASP.NET, migrations or identity connections.
  run('scripts/run-api.cjs', ['run', '--no-restore', '--no-launch-profile', '--', '--export-openapi', output]);
  const destination = path.join(root, 'packages/api-client/openapi.json');
  const generated = fs.readFileSync(output, 'utf8');
  if (check) {
    if (!fs.existsSync(destination) || fs.readFileSync(destination, 'utf8').replace(/\r\n/g, '\n') !== generated.replace(/\r\n/g, '\n'))
      throw new Error('OpenAPI contract is stale. Run npm run api:generate.');
  } else fs.writeFileSync(destination, generated);
  run('scripts/generate-api-client.cjs', check ? ['--check'] : []);
} finally {
  // Delete only this exact temporary directory, verified within the workspace artifacts path.
  if (!path.resolve(directory).startsWith(artifacts + path.sep)) throw new Error('Invalid artifact path');
  fs.rmSync(directory, { recursive: true, force: true });
}
