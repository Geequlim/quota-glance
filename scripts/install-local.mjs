import {readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const extensionUuid = 'quota-glance@geequlim';
const projectRoot = process.cwd();
const artifactsRoot = path.join(projectRoot, 'artifacts');
const zipFiles = (await readdir(artifactsRoot)).filter(name => name.endsWith('.zip'));

if (zipFiles.length !== 1) {
  throw new Error(`Expected one extension ZIP, found ${zipFiles.length}`);
}

const extensionZip = path.join(artifactsRoot, zipFiles[0]);
const existing = spawnSync(
  'gnome-extensions',
  ['info', extensionUuid],
  {encoding: 'utf8', stdio: 'pipe'},
);
const registeredBeforeInstall = existing.status === 0;
if (registeredBeforeInstall) {
  const disable = spawnSync(
    'gnome-extensions',
    ['disable', extensionUuid],
    {encoding: 'utf8', stdio: 'inherit'},
  );
  if (disable.status !== 0)
    throw new Error(`Unable to disable the existing ${extensionUuid}`);
}

const install = spawnSync('gnome-extensions', ['install', '--force', extensionZip], {
  encoding: 'utf8',
  stdio: 'inherit',
});
if (install.status !== 0) {
  throw new Error('gnome-extensions install failed');
}

const enable = spawnSync(
  'gnome-extensions',
  ['enable', extensionUuid],
  {encoding: 'utf8', stdio: 'pipe'},
);
if (enable.status !== 0) {
  if (!registeredBeforeInstall) {
    console.log(`Installed ${extensionUuid} for the current user.`);
    console.warn(
      [
        'The running GNOME Shell has not discovered this new local UUID.',
        'Sign out and sign back in once to enable it; no reinstall is needed.',
      ].join(' '),
    );
    process.exit(0);
  }
  throw new Error(
    enable.stderr || enable.stdout ||
      `Installed ${extensionUuid}, but GNOME Shell could not enable it.`,
  );
}

console.log(`Installed and enabled ${extensionUuid}`);
