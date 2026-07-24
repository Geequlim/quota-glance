import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {spawn, spawnSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const SCHEMA = 'org.gnome.shell.extensions.quota-glance';

test('development keyfile settings propagate across processes', async () => {
  const configDirectory = await mkdtemp(
    path.join(os.tmpdir(), 'quota-glance-settings-test-'),
  );
  const environment = {
    ...process.env,
    GSETTINGS_BACKEND: 'keyfile',
    GSETTINGS_SCHEMA_DIR: path.join(
      process.cwd(),
      'build',
      'quota-glance@geequlim',
      'schemas',
    ),
    XDG_CONFIG_HOME: configDirectory,
  };
  const monitor = spawn(
    'gsettings',
    ['monitor', SCHEMA, 'enabled-providers'],
    {
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  let monitorOutput = '';
  monitor.stdout.setEncoding('utf8');
  monitor.stdout.on('data', chunk => {
    monitorOutput += chunk;
  });

  try {
    await delay(100);
    const update = spawnSync(
      'gsettings',
      [
        'set',
        SCHEMA,
        'enabled-providers',
        "['codex', 'zai']",
      ],
      {
        encoding: 'utf8',
        env: environment,
      },
    );
    assert.equal(update.status, 0, update.stderr);

    await waitUntil(
      () => monitorOutput.includes('zai'),
      2000,
    );
    assert.match(monitorOutput, /enabled-providers.*zai/);
  } finally {
    monitor.kill('SIGTERM');
    await rm(configDirectory, {recursive: true, force: true});
  }
});

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function waitUntil(predicate, timeoutMilliseconds) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (!predicate() && Date.now() < deadline)
    await delay(25);
}
