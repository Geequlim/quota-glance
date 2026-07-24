import {mkdtemp, rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

export async function createTestRuntime(prefix) {
  const runtimeRoot = await mkdtemp(path.join(os.tmpdir(), prefix));

  return {
    path: runtimeRoot,
    async cleanup() {
      spawnSync(
        'fusermount3',
        ['-u', '-z', path.join(runtimeRoot, 'gvfs')],
        {stdio: 'ignore'},
      );

      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await rm(runtimeRoot, {recursive: true, force: true});
          return;
        } catch (caught) {
          if (
            !(caught instanceof Error) ||
            !('code' in caught) ||
            caught.code !== 'EBUSY' ||
            attempt === 2
          ) {
            throw caught;
          }
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
    },
  };
}
