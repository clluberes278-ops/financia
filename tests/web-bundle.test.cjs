const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { MessageChannel } = require('node:worker_threads');
const webpack = require('webpack');
const createConfig = require('../webpack.config');

const root = path.resolve(__dirname, '..');

for (const mode of ['development', 'production']) {
  test(`Almacenamiento, iconos y cliente compartido funcionan en el bundle web ${mode}`, async t => {
    const artifacts = path.join(root, 'artifacts');
    fs.mkdirSync(artifacts, { recursive: true });
    const directory = fs.mkdtempSync(path.join(artifacts, 'web-storage-test-'));
    t.after(() => {
      assert.ok(path.resolve(directory).startsWith(artifacts + path.sep));
      fs.rmSync(directory, { recursive: true, force: true });
    });
    const entry = path.join(directory, 'entry.js');
    fs.writeFileSync(entry, `
      import AsyncStorage from '@react-native-async-storage/async-storage';
      import { createFinanceClient } from '@financia/api-client';
      import React from 'react';
      import { StyleSheet } from 'react-native';
      import { renderToStaticMarkup } from 'react-dom/server.browser';
      import { MaterialDesignIcons } from '@react-native-vector-icons/material-design-icons/static';
      globalThis.iconMarkup = renderToStaticMarkup(React.createElement(MaterialDesignIcons, {
        name: 'wallet-outline', size: 24, color: '#123456', accessibilityLabel: 'Cartera'
      }));
      globalThis.iconStyles = StyleSheet.getSheet().textContent;
      const client = createFinanceClient({
        baseUrl: 'https://api.example.test', userId: 'test-user',
        getSession: async () => ({ userId: 'test-user', accessToken: 'fake-test-token' }),
        fetch: async () => ({ ok: true, status: 200, redirected: false,
          json: async () => ({ revision: '0', snapshot: { version: 2, transactions: [], pockets: [] } }) }),
      });
      globalThis.clientResult = client.getFinances().finally(() => client.dispose());
      globalThis.storageResult = (async () => {
        await AsyncStorage.setItem('financia-test', 'guardado');
        const value = await AsyncStorage.getItem('financia-test');
        await AsyncStorage.removeItem('financia-test');
        return [value, await AsyncStorage.getItem('financia-test')];
      })();
    `);
    const config = createConfig({}, { mode });
    const compiler = webpack({
      ...config, mode, context: root, entry, devtool: false,
      output: { path: path.join(directory, 'output'), filename: 'bundle.js', publicPath: '' },
      plugins: config.plugins.filter(plugin => plugin.constructor.name !== 'HtmlWebpackPlugin'),
    });
    await new Promise((resolve, reject) => compiler.run((error, stats) => {
      compiler.close(closeError => {
        if (error || closeError) return reject(error || closeError);
        if (stats.hasErrors()) return reject(new Error(stats.toString({ all: false, errors: true })));
        const missingModules = stats.toJson({ all: false, warnings: true }).warnings.filter(warning => warning.message.includes('Module not found'));
        if (missingModules.length) return reject(new Error(missingModules.map(warning => warning.message).join('\n')));
        resolve();
      });
    }));
    const values = new Map();
    const channels = [];
    class BrowserMessageChannel extends MessageChannel {
      constructor() {
        super();
        channels.push(this);
      }
    }
    t.after(() => channels.forEach(channel => {
      channel.port1.close();
      channel.port2.close();
    }));
    const browser = {
      window: { localStorage: {
        getItem: key => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
        removeItem: key => values.delete(key),
      } },
      console, setTimeout, clearTimeout, TextEncoder, TextDecoder, ReadableStream,
      URL, AbortController,
      MessageChannel: BrowserMessageChannel,
    };
    // A browser has no CommonJS require, module or exports globals.
    try {
      vm.runInNewContext(fs.readFileSync(path.join(directory, 'output/bundle.js'), 'utf8'), browser);
    } catch (error) {
      throw new Error(`El bundle web no pudo ejecutarse: ${error.message}`);
    }
    const result = await browser.storageResult;
    const finances = await browser.clientResult;
    assert.equal(finances.revision, '0');
    assert.equal(finances.snapshot.version, 2);
    assert.equal(result[0], 'guardado');
    assert.equal(result[1], null);
    assert.equal(values.size, 0);
    const glyphs = require('@react-native-vector-icons/material-design-icons/glyphmaps/MaterialDesignIcons.json');
    assert.ok(browser.iconMarkup.includes(String.fromCodePoint(glyphs['wallet-outline'])));
    assert.match(browser.iconStyles, /font-family:MaterialDesignIcons/);
    assert.match(browser.iconMarkup, /Cartera/);
  });
}
