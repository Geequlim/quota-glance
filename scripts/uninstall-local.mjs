import {access, rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const extensionUuid = 'quota-glance@geequlim';
const localExtensionRoot = path.join(
  os.homedir(),
  '.local',
  'share',
  'gnome-shell',
  'extensions',
);
const localExtensionPath = path.join(localExtensionRoot, extensionUuid);

const existing = spawnSync(
  'gnome-extensions',
  ['info', extensionUuid],
  {encoding: 'utf8', stdio: 'pipe'},
);
if (existing.status === 0) {
  spawnSync(
    'gnome-extensions',
    ['disable', extensionUuid],
    {encoding: 'utf8', stdio: 'inherit'},
  );
  const uninstall = spawnSync(
    'gnome-extensions',
    ['uninstall', extensionUuid],
    {encoding: 'utf8', stdio: 'inherit'},
  );
  if (uninstall.status !== 0)
    throw new Error(`Unable to uninstall ${extensionUuid}`);
}

if (await exists(localExtensionPath))
  await rm(localExtensionPath, {recursive: true});

console.log(`Removed local host installation ${localExtensionPath}`);
console.log('Quota Glance settings and provider credentials were preserved.');

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
