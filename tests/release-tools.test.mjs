import assert from 'node:assert/strict';
import {access, readFile} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';

const projectRoot = process.cwd();

test('release version is consistent across package metadata', async () => {
  const [packageJson, packageLock, metadata] = await Promise.all([
    readJson('package.json'),
    readJson('package-lock.json'),
    readJson('metadata.json'),
  ]);

  assert.equal(packageLock.version, packageJson.version);
  assert.equal(packageLock.packages[''].version, packageJson.version);
  assert.equal(metadata['version-name'], packageJson.version);
});

test('Tiny exposes release commands without npm script indirection', async () => {
  const tinyProject = await readFile(
    path.join(projectRoot, 'project.tiny'),
    'utf8',
  );

  assert.match(tinyProject, /name: version/);
  assert.match(tinyProject, /name: build/);
  assert.match(tinyProject, /name: github/);
  assert.match(tinyProject, /name: aur/);
  assert.match(tinyProject, /tiny run publish\/build/);
  assert.doesNotMatch(tinyProject, /\bnpm\b/);

  await Promise.all([
    access(path.join(projectRoot, 'scripts', 'update-version.mjs')),
    access(path.join(projectRoot, 'scripts', 'release-github.mjs')),
    access(path.join(projectRoot, 'scripts', 'release-aur.mjs')),
  ]);
});

async function readJson(relativePath) {
  return JSON.parse(
    await readFile(path.join(projectRoot, relativePath), 'utf8'),
  );
}
