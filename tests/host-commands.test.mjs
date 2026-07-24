import assert from 'node:assert/strict';
import {access, readFile} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';

test('host test commands expose install and cleanup workflows', async () => {
  const packageJson = JSON.parse(
    await readFile(path.join(process.cwd(), 'package.json'), 'utf8'),
  );

  assert.equal(
    packageJson.scripts['host:install'],
    'npm run package && node scripts/install-local.mjs',
  );
  assert.equal(
    packageJson.scripts['host:clean'],
    'node scripts/uninstall-local.mjs',
  );
  await access(path.join(process.cwd(), 'scripts', 'install-local.mjs'));
  await access(path.join(process.cwd(), 'scripts', 'uninstall-local.mjs'));

  const installer = await readFile(
    path.join(process.cwd(), 'scripts', 'install-local.mjs'),
    'utf8',
  );
  assert.match(installer, /registeredBeforeInstall/);
  assert.match(installer, /Sign out and sign back in once/);
});
