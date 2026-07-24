import {existsSync} from 'node:fs';
import {mkdtemp, rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const DASH_TO_PANEL_ROOT =
  '/usr/share/gnome-shell/extensions/dash-to-panel@jderose9.github.com';

export async function createDashToPanelFixture() {
  if (!existsSync(DASH_TO_PANEL_ROOT))
    return null;

  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), 'quota-glance-dtp-'),
  );
  const zipPath = path.join(temporaryRoot, 'dash-to-panel.zip');
  const archive = spawnSync('bsdtar', ['-a', '-cf', zipPath, '.'], {
    cwd: DASH_TO_PANEL_ROOT,
    encoding: 'utf8',
    stdio: 'pipe',
  });
  if (archive.error) {
    await rm(temporaryRoot, {recursive: true, force: true});
    throw archive.error;
  }
  if (archive.status !== 0) {
    await rm(temporaryRoot, {recursive: true, force: true});
    throw new Error(
      archive.stderr || archive.stdout || 'Unable to package Dash to Panel',
    );
  }

  return {
    zipPath,
    cleanup: () => rm(temporaryRoot, {recursive: true, force: true}),
  };
}
