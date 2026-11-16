const test = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:net');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { checkLocalPort } = require('../scripts/check-local-port.cjs');

test('El arranque web explica un puerto ocupado sin iniciar un segundo webpack', async t => {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const port = server.address().port;
  await assert.rejects(checkLocalPort(port), /ya está ocupado/);
  const child = spawn(process.execPath, [path.resolve(__dirname, '../scripts/run-connected.cjs'), 'web', '--port', String(port)], {
    cwd: path.resolve(__dirname, '..'), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => { if (child.exitCode === null) child.kill(); });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  const code = await new Promise((resolve, reject) => { child.on('exit', resolve); child.on('error', reject); });
  assert.equal(code, 1);
  assert.match(output, new RegExp(`puerto ${port} ya está ocupado`));
  assert.match(output, /Ctrl\+C/);
  assert.doesNotMatch(output, /node:net|throw error|webpack-dev-server/);
});
