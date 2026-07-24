import assert from 'node:assert/strict';
import test from 'node:test';

import {StateStore} from '../.build-js/core/state-store.js';

test('state store preserves the last successful snapshot after an error', () => {
  const store = new StateStore();
  store.initializeProvider('example', true);

  store.markLoading('example');
  store.markReady('example', {remaining: 72}, 1234);
  store.markLoading('example');
  store.markError('example', {
    code: 'timeout',
    message: 'Request timed out',
    retryable: true,
  });

  const state = store.get('example');
  assert.equal(state.phase, 'error');
  assert.equal(state.data, null);
  assert.deepEqual(state.lastSuccessfulData, {remaining: 72});
  assert.equal(state.updatedAt, 1234);
});

test('state store notifies subscribers for state changes', () => {
  const store = new StateStore();
  let changes = 0;
  const unsubscribe = store.subscribe(() => changes++);

  store.initializeProvider('example', false);
  store.setEnabled('example', true);
  store.markLoading('example');
  unsubscribe();
  store.markReady('example', {remaining: 50});

  assert.equal(changes, 3);
});

