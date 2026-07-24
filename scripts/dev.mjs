import {existsSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

import {createDashToPanelFixture} from './dash-to-panel-fixture.mjs';

const devkitPath = '/usr/lib/mutter-devkit';
if (!existsSync(devkitPath)) {
  console.error(
    [
      'Visible GNOME Shell previews require mutter-devkit on GNOME 49+.',
      'Install it once on CachyOS/Arch:',
      '',
      '  sudo pacman -S --needed mutter-devkit',
      '',
      'Then run npm run dev again.',
    ].join('\n'),
  );
  process.exit(1);
}

const dashToPanelFixture = await createDashToPanelFixture();
const hostConfigHome =
  process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), '.config');

try {
  const extensionArguments = dashToPanelFixture
    ? ['--extension', dashToPanelFixture.zipPath]
    : [];
  const preview = spawnSync(
    'dbus-run-session',
    [
      'gnome-shell-test-tool',
      '--devkit',
      '--disable-animations',
      ...extensionArguments,
      '--extension',
      'artifacts/quota-glance@geequlim.shell-extension.zip',
      dashToPanelFixture
        ? 'tests/gnome-shell-dtp-preview.js'
        : 'tests/gnome-shell-preview.js',
    ],
    {
      env: {
        ...process.env,
        GH_CONFIG_DIR:
          process.env.GH_CONFIG_DIR ?? path.join(hostConfigHome, 'gh'),
      },
      stdio: 'inherit',
    },
  );

  if (preview.error)
    throw preview.error;

  process.exitCode = preview.status ?? 1;
} finally {
  await dashToPanelFixture?.cleanup();
}
