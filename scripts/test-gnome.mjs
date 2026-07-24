import {spawnSync} from 'node:child_process';
import process from 'node:process';

import {createTestRuntime} from './test-runtime-directory.mjs';

const runtime = await createTestRuntime('quota-glance-runtime-');
const environment = {
  ...process.env,
  XDG_RUNTIME_DIR: runtime.path,
};
for (const key of [
  'Z_AI_API_KEY',
  'DEEPSEEK_API_KEY',
  'OPENCODE_GO_WORKSPACE_ID',
  'OPENCODE_GO_AUTH_COOKIE',
]) {
  delete environment[key];
}

try {
  const test = spawnSync(
    'dbus-run-session',
    [
      'gnome-shell-test-tool',
      '--headless',
      '--disable-animations',
      '--extension',
      'artifacts/quota-glance@geequlim.shell-extension.zip',
      'tests/gnome-shell-smoke.js',
    ],
    {
      env: environment,
      stdio: 'inherit',
    },
  );
  if (test.error)
    throw test.error;
  process.exitCode = test.status ?? 1;
} finally {
  await runtime.cleanup();
}
