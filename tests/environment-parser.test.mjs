import assert from 'node:assert/strict';
import test from 'node:test';

import {
  mergeEnvironmentSources,
  normalizeProxyVariables,
  parseEnvironmentFile,
} from '../.build-js/runtime/environment-parser.js';

test('environment parser accepts only literal allowlisted assignments', () => {
  const parsed = parseEnvironmentFile(`
    # comment
    export DEEPSEEK_API_KEY="deep-key"
    Z_AI_API_KEY='z-key'
    GH_CONFIG_DIR=/home/example/.config/gh
    OPENCODE_GO_AUTH_COOKIE=$(should-not-run)
    UNKNOWN_SECRET=ignored
  `);

  assert.deepEqual(parsed, {
    DEEPSEEK_API_KEY: 'deep-key',
    Z_AI_API_KEY: 'z-key',
    GH_CONFIG_DIR: '/home/example/.config/gh',
    OPENCODE_GO_AUTH_COOKIE: '$(should-not-run)',
  });
});

test('environment sources have deterministic precedence and proxy aliases', () => {
  const merged = normalizeProxyVariables(mergeEnvironmentSources(
    {DEEPSEEK_API_KEY: 'system', http_proxy: 'http://system'},
    {DEEPSEEK_API_KEY: 'session'},
    {DEEPSEEK_API_KEY: 'project', HTTPS_PROXY: 'http://secure'},
  ));

  assert.equal(merged.DEEPSEEK_API_KEY, 'project');
  assert.equal(merged.HTTP_PROXY, 'http://system');
  assert.equal(merged.http_proxy, 'http://system');
  assert.equal(merged.HTTPS_PROXY, 'http://secure');
  assert.equal(merged.https_proxy, 'http://secure');
});
