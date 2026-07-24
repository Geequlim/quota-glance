import {createHash} from 'node:crypto';
import {readFile, readdir, writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const projectRoot = process.cwd();
const artifactsRoot = path.join(projectRoot, 'artifacts');
const packageJson = JSON.parse(
  await readFile(path.join(projectRoot, 'package.json'), 'utf8'),
);
const tag = `v${packageJson.version}`;

ensureCleanWorktree();
ensureTagPointsAtHead(tag);
ensureTagIsOnOrigin(tag);

const zipFiles = (await readdir(artifactsRoot))
  .filter(name => name.endsWith('.zip'));
if (zipFiles.length !== 1)
  throw new Error(`Expected one release ZIP, found ${zipFiles.length}.`);

const zipPath = path.join(artifactsRoot, zipFiles[0]);
const checksum = createHash('sha256')
  .update(await readFile(zipPath))
  .digest('hex');
const checksumsPath = path.join(artifactsRoot, 'SHA256SUMS');
await writeFile(checksumsPath, `${checksum}  ${zipFiles[0]}\n`);

const existingRelease = run(
  'gh',
  ['release', 'view', tag, '--json', 'url'],
  {allowFailure: true},
);
if (existingRelease.status === 0)
  throw new Error(`GitHub Release ${tag} already exists.`);

run('gh', [
  'release',
  'create',
  tag,
  zipPath,
  checksumsPath,
  '--verify-tag',
  '--title',
  `Quota Glance ${tag}`,
  '--generate-notes',
]);

const releaseUrl = run(
  'gh',
  ['release', 'view', tag, '--json', 'url', '--jq', '.url'],
).stdout.trim();
console.log(`Published GitHub Release ${tag}: ${releaseUrl}`);

function ensureCleanWorktree() {
  const status = run('git', ['status', '--porcelain']).stdout.trim();
  if (status)
    throw new Error('Working tree is not clean. Commit the release changes first.');
}

function ensureTagPointsAtHead(releaseTag) {
  const head = run('git', ['rev-parse', 'HEAD']).stdout.trim();
  const taggedCommit = run(
    'git',
    ['rev-list', '-n', '1', releaseTag],
    {allowFailure: true},
  );
  if (taggedCommit.status !== 0)
    throw new Error(`Local tag ${releaseTag} does not exist.`);
  if (taggedCommit.stdout.trim() !== head)
    throw new Error(`${releaseTag} does not point at the current commit.`);
}

function ensureTagIsOnOrigin(releaseTag) {
  const remoteTag = run(
    'git',
    ['ls-remote', '--exit-code', '--tags', 'origin', `refs/tags/${releaseTag}`],
    {allowFailure: true},
  );
  if (remoteTag.status !== 0)
    throw new Error(`Tag ${releaseTag} has not been pushed to origin.`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    encoding: 'utf8',
    stdio: options.allowFailure ? 'pipe' : ['inherit', 'pipe', 'inherit'],
  });
  if (!options.allowFailure && result.status !== 0)
    throw new Error(`${command} ${args.join(' ')} failed.`);
  return result;
}
