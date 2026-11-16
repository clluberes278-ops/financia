const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const mobileRoot = path.resolve(__dirname, '../apps/mobile');

test('React Native resolves both native projects and hoisted autolinking dependencies from the mobile workspace', () => {
  const cli = require.resolve('react-native/cli.js', { paths: [mobileRoot] });
  const result = spawnSync(process.execPath, [cli, 'config'], {
    cwd: mobileRoot, encoding: 'utf8', windowsHide: true, timeout: 30000, maxBuffer: 2 * 1024 * 1024,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  const config = JSON.parse(result.stdout);
  assert.equal(fs.realpathSync(config.root), fs.realpathSync(mobileRoot));
  assert.equal(fs.realpathSync(config.reactNativePath), fs.realpathSync(path.dirname(
    require.resolve('react-native/package.json', { paths: [mobileRoot] }))));
  assert.equal(fs.realpathSync(config.project.android.sourceDir), fs.realpathSync(path.join(mobileRoot, 'android')));
  assert.equal(config.project.android.applicationId, 'com.kal.financia');
  assert.equal(fs.realpathSync(config.project.ios.sourceDir), fs.realpathSync(path.join(mobileRoot, 'ios')));
  assert.ok(fs.statSync(path.join(config.project.ios.sourceDir, config.project.ios.xcodeProject.name)).isDirectory());

  for (const name of ['@react-native-async-storage/async-storage', 'react-native-gesture-handler', 'react-native-reanimated']) {
    const dependency = config.dependencies[name];
    assert.ok(dependency, `${name} must be discovered for autolinking`);
    const manifest = JSON.parse(fs.readFileSync(path.join(dependency.root, 'package.json'), 'utf8'));
    assert.equal(manifest.name, name);
    assert.ok(fs.statSync(dependency.platforms.android.sourceDir).isDirectory());
    assert.ok(fs.statSync(dependency.platforms.ios.podspecPath).isFile());
  }
});
