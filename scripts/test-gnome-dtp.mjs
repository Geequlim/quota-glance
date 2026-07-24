import {spawnSync} from 'node:child_process';
import process from 'node:process';

import {createDashToPanelFixture} from './dash-to-panel-fixture.mjs';
import {createTestRuntime} from './test-runtime-directory.mjs';

const fixture = await createDashToPanelFixture();
if (!fixture)
  throw new Error('Dash to Panel is not installed system-wide');
const runtime = await createTestRuntime('quota-glance-dtp-runtime-');

try {
  const test = spawnSync(
    'dbus-run-session',
    [
      'gnome-shell-test-tool',
      '--headless',
      '--disable-animations',
      '--extension',
      fixture.zipPath,
      '--extension',
      'artifacts/quota-glance@geequlim.shell-extension.zip',
      'tests/gnome-shell-dtp-smoke.js',
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        GSETTINGS_BACKEND: 'memory',
        XDG_RUNTIME_DIR: runtime.path,
      },
      stdio: 'inherit',
    },
  );

  if (test.error)
    throw test.error;

  process.exitCode = test.status ?? 1;
} finally {
  await fixture.cleanup();
  await runtime.cleanup();
}
