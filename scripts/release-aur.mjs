import {createHash} from 'node:crypto';
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const projectRoot = process.cwd();
const repository = 'Geequlim/quota-glance';
const packageName = 'gnome-shell-extension-quota-glance';
const extensionUuid = 'quota-glance@geequlim';
const assetName = `${extensionUuid}.shell-extension.zip`;
const packageJson = JSON.parse(
  await readFile(path.join(projectRoot, 'package.json'), 'utf8'),
);
const version = packageJson.version;
const tag = `v${version}`;
const aurRoot = process.env.AUR_REPO_DIR
  ? path.resolve(process.env.AUR_REPO_DIR)
  : path.join(
    os.homedir(),
    '.cache',
    'quota-glance',
    'aur',
    packageName,
  );
const temporaryRoot = await mkdtemp(
  path.join(os.tmpdir(), 'quota-glance-aur-'),
);

try {
  ensureCommand('gh');
  ensureCommand('git');
  ensureCommand('makepkg');
  ensureGithubRelease();

  const assetPath = path.join(temporaryRoot, assetName);
  run('gh', [
    'release',
    'download',
    tag,
    '--repo',
    repository,
    '--pattern',
    assetName,
    '--dir',
    temporaryRoot,
  ]);
  const checksum = createHash('sha256')
    .update(await readFile(assetPath))
    .digest('hex');

  await prepareAurRepository();
  ensureCleanAurRepository();

  await writeFile(
    path.join(aurRoot, 'PKGBUILD'),
    createPkgbuild(checksum),
  );
  const srcinfo = run('makepkg', ['--printsrcinfo'], {cwd: aurRoot}).stdout;
  await writeFile(path.join(aurRoot, '.SRCINFO'), srcinfo);

  run('git', ['add', 'PKGBUILD', '.SRCINFO'], {cwd: aurRoot});
  const staged = run(
    'git',
    ['diff', '--cached', '--quiet'],
    {cwd: aurRoot, allowFailure: true},
  );
  if (staged.status === 0) {
    console.log(`AUR package ${packageName} is already at ${version}.`);
  } else if (staged.status !== 1) {
    throw new Error('Unable to inspect staged AUR changes.');
  } else {
    run(
      'git',
      ['commit', '-m', `Update to ${version}`],
      {cwd: aurRoot},
    );
    run('git', ['push', 'origin', 'master'], {cwd: aurRoot});
    console.log(`Published ${packageName} ${version} to AUR.`);
  }
} finally {
  await rm(temporaryRoot, {recursive: true, force: true});
}

function ensureGithubRelease() {
  const release = run(
    'gh',
    [
      'release',
      'view',
      tag,
      '--repo',
      repository,
      '--json',
      'tagName',
      '--jq',
      '.tagName',
    ],
  ).stdout.trim();
  if (release !== tag)
    throw new Error(`GitHub Release ${tag} was not found.`);
}

async function prepareAurRepository() {
  if (await exists(path.join(aurRoot, '.git'))) {
    ensureCleanAurRepository();
    const hasCommit = run(
      'git',
      ['rev-parse', '--verify', 'HEAD'],
      {cwd: aurRoot, allowFailure: true},
    );
    if (hasCommit.status === 0)
      run('git', ['pull', '--ff-only', 'origin', 'master'], {cwd: aurRoot});
    return;
  }

  await mkdir(path.dirname(aurRoot), {recursive: true});
  run('git', [
    'clone',
    `ssh://aur@aur.archlinux.org/${packageName}.git`,
    aurRoot,
  ]);
}

function ensureCleanAurRepository() {
  const status = run(
    'git',
    ['status', '--porcelain'],
    {cwd: aurRoot},
  ).stdout.trim();
  if (status)
    throw new Error(`AUR repository is not clean: ${aurRoot}`);
}

function ensureCommand(command) {
  const result = spawnSync(command, ['--version'], {
    encoding: 'utf8',
    stdio: 'ignore',
  });
  if (result.status !== 0)
    throw new Error(`Required command is unavailable: ${command}`);
}

function createPkgbuild(checksum) {
  return `pkgname=${packageName}
pkgver=${version}
pkgrel=1
pkgdesc='View AI service quotas and balances from a GNOME panel'
arch=('any')
url='https://github.com/${repository}'
license=('GPL-3.0-or-later')
depends=('gnome-shell' 'glib2')
optdepends=('github-cli: GitHub Copilot quota provider')
source=("\${pkgname}-\${pkgver}.zip::https://github.com/${repository}/releases/download/v\${pkgver}/${assetName}")
noextract=("\${pkgname}-\${pkgver}.zip")
sha256sums=('${checksum}')

package() {
  local extension_dir="\${pkgdir}/usr/share/gnome-shell/extensions/${extensionUuid}"

  install -dm755 "\${extension_dir}"
  bsdtar -xf "\${srcdir}/\${pkgname}-\${pkgver}.zip" -C "\${extension_dir}"
  glib-compile-schemas "\${extension_dir}/schemas"
}
`;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? projectRoot,
    encoding: 'utf8',
    stdio: options.allowFailure ? 'pipe' : ['inherit', 'pipe', 'inherit'],
  });
  if (!options.allowFailure && result.status !== 0)
    throw new Error(`${command} ${args.join(' ')} failed.`);
  return result;
}

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}
