import assert from 'node:assert/strict';
import test from 'node:test';

import {sanitizeSensitiveText} from '../.build-js/runtime/sanitize.js';

test('sanitizer removes explicit secrets and sensitive assignments', () => {
  const secret = 'super-secret-token';
  const sanitized = sanitizeSensitiveText(
    `Authorization: Bearer ${secret}\nCookie: auth=${secret} api_key=${secret}`,
    [secret, `Bearer ${secret}`],
  );

  assert.doesNotMatch(sanitized, /super-secret-token/);
  assert.match(sanitized, /\[redacted\]/);
  assert.doesNotMatch(sanitized, /[\r\n]/);
});
