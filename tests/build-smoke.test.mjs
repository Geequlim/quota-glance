import assert from 'node:assert/strict';
import {access, readFile} from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import process from 'node:process';

const extensionRoot = path.join(
  process.cwd(),
  'build',
  'quota-glance@geequlim',
);

test('build contains a loadable extension layout', async () => {
  const requiredFiles = [
    'extension.js',
    'prefs.js',
    'icons/codex-symbolic.svg',
    'icons/copilot-symbolic.svg',
    'icons/deepseek-symbolic.svg',
    'icons/opencode-go-symbolic.svg',
    'icons/zai-symbolic.svg',
    'core/controller.js',
    'host/panel-indicator.js',
    'providers/codex/provider.js',
    'runtime/http-client.js',
    'shared/formatters.js',
    'shared/i18n/en.js',
    'shared/i18n/index.js',
    'shared/i18n/language.js',
    'shared/i18n/zh-cn.js',
    'shared/provider-catalog.js',
    'metadata.json',
    'stylesheet.css',
    'schemas/gschemas.compiled',
  ];

  await Promise.all(
    requiredFiles.map(file => access(path.join(extensionRoot, file))),
  );

  const metadata = JSON.parse(
    await readFile(path.join(extensionRoot, 'metadata.json'), 'utf8'),
  );
  assert.equal(metadata.uuid, 'quota-glance@geequlim');
  assert.deepEqual(metadata['shell-version'], ['50']);
  assert.equal(
    metadata['settings-schema'],
    'org.gnome.shell.extensions.quota-glance',
  );
});
