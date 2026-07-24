import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {ProviderRuntimeError} from './errors.js';
import type {RuntimeEnvironment} from './environment-parser.js';
import {sanitizeSensitiveText} from './sanitize.js';

Gio._promisify(
  Gio.Subprocess.prototype,
  'communicate_utf8_async',
  'communicate_utf8_finish',
);

export interface CommandResult {
  stdout: string;
  stderr: string;
}

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024;

export class CommandRunner {
  readonly #environment: RuntimeEnvironment;
  readonly #activeProcesses = new Set<Gio.Subprocess>();
  #disposed = false;

  constructor(environment: RuntimeEnvironment) {
    this.#environment = environment;
  }

  findExecutable(name: string): string | null {
    const searchPath = this.#environment.PATH ?? GLib.getenv('PATH') ?? '';
    for (const directory of searchPath.split(':')) {
      if (!directory)
        continue;
      const candidate = GLib.build_filenamev([directory, name]);
      if (GLib.file_test(candidate, GLib.FileTest.IS_EXECUTABLE))
        return candidate;
    }
    return null;
  }

  createProcess(argv: readonly string[]): Gio.Subprocess {
    if (this.#disposed) {
      throw new ProviderRuntimeError(
        'internal',
        'Command runner has been disposed',
        {retryable: false},
      );
    }

    try {
      const launcher = new Gio.SubprocessLauncher({
        flags:
          Gio.SubprocessFlags.STDIN_PIPE |
          Gio.SubprocessFlags.STDOUT_PIPE |
          Gio.SubprocessFlags.STDERR_PIPE,
      });
      launcher.set_environ(buildChildEnvironment(this.#environment));
      const process = launcher.spawnv([...argv]);
      this.#activeProcesses.add(process);
      return process;
    } catch (caught) {
      throw new ProviderRuntimeError(
        'process-exited',
        `Unable to start ${argv[0]}`,
        {
          cause: caught,
          debugMessage: sanitizeSensitiveText(caught),
        },
      );
    }
  }

  releaseProcess(process: Gio.Subprocess): void {
    this.#activeProcesses.delete(process);
  }

  async run(
    argv: readonly string[],
    callerCancellable: Gio.Cancellable,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxOutputBytes = DEFAULT_MAX_OUTPUT_BYTES,
  ): Promise<CommandResult> {
    const process = this.createProcess(argv);
    const cancellable = new Gio.Cancellable();
    let timedOut = false;
    const callerSignalId = callerCancellable.connect(() => {
      cancellable.cancel();
      process.force_exit();
    });
    const timeoutSourceId = GLib.timeout_add(
      GLib.PRIORITY_DEFAULT,
      timeoutMs,
      () => {
        timedOut = true;
        cancellable.cancel();
        process.force_exit();
        return GLib.SOURCE_REMOVE;
      },
    );

    try {
      const [stdout = '', stderr = ''] =
        await process.communicate_utf8_async(null, cancellable);
      if (
        new TextEncoder().encode(stdout).byteLength > maxOutputBytes ||
        new TextEncoder().encode(stderr).byteLength > maxOutputBytes
      ) {
        throw new ProviderRuntimeError(
          'invalid-response',
          'Command output exceeded the size limit',
          {retryable: false},
        );
      }
      if (!process.get_successful()) {
        const details = sanitizeSensitiveText(stderr || stdout, [], 240);
        const notAuthenticated =
          /auth|login|logged in|credential|token/i.test(details);
        throw new ProviderRuntimeError(
          notAuthenticated ? 'not-authenticated' : 'process-exited',
          details || `${argv[0]} exited unsuccessfully`,
          {retryable: !notAuthenticated},
        );
      }
      return {stdout, stderr};
    } catch (caught) {
      if (caught instanceof ProviderRuntimeError)
        throw caught;
      if (timedOut) {
        throw new ProviderRuntimeError(
          'timeout',
          `${argv[0]} timed out`,
          {cause: caught},
        );
      }
      if (callerCancellable.is_cancelled()) {
        throw new ProviderRuntimeError(
          'cancelled',
          `${argv[0]} was cancelled`,
          {cause: caught},
        );
      }
      throw new ProviderRuntimeError(
        'process-exited',
        `${argv[0]} failed`,
        {
          cause: caught,
          debugMessage: sanitizeSensitiveText(caught),
        },
      );
    } finally {
      if (GLib.MainContext.default().find_source_by_id(timeoutSourceId))
        GLib.source_remove(timeoutSourceId);
      callerCancellable.disconnect(callerSignalId);
      if (!process.get_if_exited())
        process.force_exit();
      this.releaseProcess(process);
    }
  }

  dispose(): void {
    if (this.#disposed)
      return;
    this.#disposed = true;
    for (const process of this.#activeProcesses)
      process.force_exit();
    this.#activeProcesses.clear();
  }
}

function buildChildEnvironment(
  environment: RuntimeEnvironment,
): string[] {
  const result = new Map<string, string>();
  for (const key of [
    'HOME',
    'USER',
    'LOGNAME',
    'LANG',
    'LC_ALL',
    'XDG_CACHE_HOME',
    'XDG_CONFIG_HOME',
    'XDG_DATA_HOME',
    'SSL_CERT_FILE',
  ]) {
    const value = GLib.getenv(key);
    if (value !== null)
      result.set(key, value);
  }
  for (const [key, value] of Object.entries(environment)) {
    if (value !== undefined)
      result.set(key, value);
  }
  return [...result].map(([key, value]) => `${key}=${value}`);
}
