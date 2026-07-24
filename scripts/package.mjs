import {mkdir, readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const projectRoot = process.cwd();
const sourceRoot = path.join(projectRoot, 'build', 'quota-glance@geequlim');
const artifactsRoot = path.join(projectRoot, 'artifacts');
const moduleDirectories = [
  'core',
  'host',
  'icons',
  'providers',
  'runtime',
  'shared',
];

await mkdir(artifactsRoot, {recursive: true});

const pack = spawnSync(
  'gnome-extensions',
  [
    'pack',
    '--force',
    '--out-dir',
    artifactsRoot,
    '--extra-source=LICENSE',
    ...moduleDirectories.map(directory => `--extra-source=${directory}`),
    sourceRoot,
  ],
  {encoding: 'utf8', stdio: 'pipe'},
);
if (pack.status !== 0) {
  throw new Error(pack.stderr || pack.stdout || 'gnome-extensions pack failed');
}

const zipFiles = (await readdir(artifactsRoot)).filter(name => name.endsWith('.zip'));
if (zipFiles.length !== 1) {
  throw new Error(`Expected one extension ZIP, found ${zipFiles.length}`);
}

const zipPath = path.join(artifactsRoot, zipFiles[0]);
const archiveList = spawnSync('unzip', ['-Z1', zipPath], {
  encoding: 'utf8',
  stdio: 'pipe',
});
if (archiveList.status !== 0) {
  throw new Error(
    archiveList.stderr || archiveList.stdout || 'Unable to inspect extension ZIP',
  );
}

const archiveEntries = new Set(archiveList.stdout.trim().split('\n'));
const requiredEntries = [
  'extension.js',
  'prefs.js',
  'LICENSE',
  'icons/codex-symbolic.svg',
  'icons/copilot-symbolic.svg',
  'icons/deepseek-symbolic.svg',
  'icons/opencode-go-symbolic.svg',
  'icons/zai-symbolic.svg',
  'core/controller.js',
  'host/panel-indicator.js',
  'providers/codex/provider.js',
  'providers/copilot/provider.js',
  'runtime/command-runner.js',
  'runtime/http-client.js',
  'shared/formatters.js',
  'shared/provider-catalog.js',
];
const missingEntries = requiredEntries.filter(entry => !archiveEntries.has(entry));
if (missingEntries.length > 0) {
  throw new Error(
    `Extension ZIP is missing runtime modules: ${missingEntries.join(', ')}`,
  );
}

console.log(`Packaged ${path.relative(projectRoot, zipPath)}`);
