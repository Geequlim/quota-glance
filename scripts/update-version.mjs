import {readFile, writeFile} from 'node:fs/promises';
import process from 'node:process';
import {createInterface} from 'node:readline/promises';

const packagePath = new URL('../package.json', import.meta.url);
const lockPath = new URL('../package-lock.json', import.meta.url);
const metadataPath = new URL('../metadata.json', import.meta.url);
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

const packageJson = await readJson(packagePath);
const packageLock = await readJson(lockPath);
const metadata = await readJson(metadataPath);
const currentVersion = packageJson.version;

console.log(`当前版本：${currentVersion}`);

if (!process.stdin.isTTY || !process.stdout.isTTY)
  throw new Error('版本更新必须在交互式终端中运行。');

const terminal = createInterface({
  input: process.stdin,
  output: process.stdout,
});

let nextVersion;
try {
  nextVersion = (await terminal.question('请输入新的版本号（例如 0.2.0）：')).trim();
} finally {
  terminal.close();
}

if (!versionPattern.test(nextVersion))
  throw new Error('版本号必须使用 MAJOR.MINOR.PATCH 格式，例如 0.2.0。');

if (nextVersion === currentVersion)
  throw new Error('新版本号不能与当前版本相同。');

packageJson.version = nextVersion;
packageLock.version = nextVersion;
if (!packageLock.packages?.[''])
  throw new Error('package-lock.json 缺少根包信息。');
packageLock.packages[''].version = nextVersion;
metadata['version-name'] = nextVersion;

await Promise.all([
  writeJson(packagePath, packageJson),
  writeJson(lockPath, packageLock),
  writeJson(metadataPath, metadata),
]);

const tag = `v${nextVersion}`;
console.log(`\n版本已从 ${currentVersion} 更新为 ${nextVersion}。`);
console.log('请检查变更后执行：\n');
console.log('  git add package.json package-lock.json metadata.json');
console.log(`  git commit -m "Release ${tag}"`);
console.log(`  git tag -a ${tag} -m "Quota Glance ${tag}"`);
console.log('  git push origin HEAD');
console.log(`  git push origin ${tag}`);
console.log('\n标签上传后，可执行 tiny run publish/github 创建 GitHub Release。');

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function writeJson(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
}
