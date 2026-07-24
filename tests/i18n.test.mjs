import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createTranslatorForLanguage,
  resolveLanguage,
} from '../.build-js/shared/i18n/language.js';
import {
  formatResetAt,
  formatUpdatedAt,
} from '../.build-js/shared/formatters.js';
import {remainingLevel} from '../.build-js/shared/quota-style.js';

test('uses Simplified Chinese for Simplified Chinese desktop locales', () => {
  for (const locale of [
    'zh_CN.UTF-8',
    'zh_CN',
    'zh_SG.UTF-8',
    'zh-Hans',
    'zh-Hans-CN',
  ]) {
    assert.equal(resolveLanguage([locale]), 'zh-CN', locale);
  }
});

test('falls back to English for every other desktop locale', () => {
  for (const locale of [
    'en_US.UTF-8',
    'ja_JP.UTF-8',
    'zh_TW.UTF-8',
    'zh_HK.UTF-8',
    'zh-Hant',
    'C',
  ]) {
    assert.equal(resolveLanguage([locale]), 'en', locale);
  }
});

test('checks all language names reported by GLib', () => {
  assert.equal(resolveLanguage(['fr_FR.UTF-8', 'zh_CN', 'en_US']), 'zh-CN');
});

test('translates and interpolates interface messages', () => {
  const english = createTranslatorForLanguage('en');
  const chinese = createTranslatorForLanguage('zh-CN');

  assert.equal(english.t('action.settings'), 'Settings');
  assert.equal(chinese.t('action.settings'), '设置');
  assert.deepEqual(
    [
      chinese.t('provider.opencode.metric.rolling'),
      chinese.t('provider.opencode.metric.weekly'),
      chinese.t('provider.opencode.metric.monthly'),
    ],
    ['5小时', '7天', '月度'],
  );
  assert.equal(
    english.t('provider.common.remaining', {remaining: 4, total: 10}),
    '4 / 10 remaining',
  );
  assert.equal(
    chinese.t('provider.common.remaining', {remaining: 4, total: 10}),
    '剩余 4 / 10',
  );
});

test('formats relative time with the selected language', () => {
  const english = createTranslatorForLanguage('en');
  const chinese = createTranslatorForLanguage('zh-CN');

  assert.equal(formatUpdatedAt(null, english), 'Never');
  assert.equal(formatUpdatedAt(null, chinese), '从未');
  assert.equal(formatUpdatedAt(Date.now(), english), 'Just now');
  assert.equal(formatUpdatedAt(Date.now(), chinese), '刚刚');
});

test('formats reset dates with the selected locale', () => {
  const resetAt = Date.UTC(2026, 6, 24, 10, 30);
  const english = formatResetAt(resetAt, createTranslatorForLanguage('en'));
  const chinese = formatResetAt(
    resetAt,
    createTranslatorForLanguage('zh-CN'),
  );

  assert.notEqual(english, chinese);
  assert.match(english, /Jul/);
  assert.match(chinese, /7月/);
});

test('classifies remaining quota into semantic progress levels', () => {
  assert.equal(remainingLevel(0.8), 'high');
  assert.equal(remainingLevel(0.5), 'high');
  assert.equal(remainingLevel(0.35), 'medium');
  assert.equal(remainingLevel(0.2), 'medium');
  assert.equal(remainingLevel(0.19), 'low');
  assert.equal(remainingLevel(-1), 'low');
});
