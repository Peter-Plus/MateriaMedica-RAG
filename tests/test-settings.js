const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ONLINE_URL, loadSettings, updateSettings, serverUrl } = require('../client/settings');

test('default and legacy settings use online service until debug is enabled', () => {
  assert.equal(serverUrl(loadSettings()), ONLINE_URL);
  const legacy = loadSettings({ serverUrl: 'http://localhost:8123' });
  assert.equal(serverUrl(legacy), ONLINE_URL);
  assert.equal(legacy.debugServerUrl, 'http://localhost:8123');
});
test('debug choice persists and turning it off retains endpoint but restores online', () => {
  const debug = updateSettings(loadSettings(), { localDebug: true, address: 'http://localhost', port: '8123' });
  assert.equal(serverUrl(loadSettings(JSON.parse(JSON.stringify(debug)))), 'http://localhost:8123');
  const online = updateSettings(debug, { localDebug: false, address: 'invalid', port: '' });
  assert.equal(serverUrl(online), ONLINE_URL);
  assert.equal(online.debugServerUrl, debug.debugServerUrl);
});
test('reject unsafe addresses and invalid ports; support IPv6 loopback', () => {
  for (const address of ['file:///test', 'http://example.com', 'https://user:pass@example.com', 'https://example.com/api', 'https://example.com/?q=x']) {
    assert.throws(() => updateSettings(loadSettings(), { localDebug: true, address, port: '8000' }));
  }
  for (const port of ['', '0', '65536', '8.5', 'abc', '-1']) {
    assert.throws(() => updateSettings(loadSettings(), { localDebug: true, address: 'http://localhost', port }));
  }
  assert.equal(serverUrl(updateSettings(loadSettings(), { localDebug: true, address: 'http://[::1]', port: '8000' })), 'http://[::1]:8000');
});
