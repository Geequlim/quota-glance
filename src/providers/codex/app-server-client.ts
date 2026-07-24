import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import {ProviderRuntimeError} from '../../runtime/errors.js';
import {CommandRunner} from '../../runtime/command-runner.js';
import {sanitizeSensitiveText} from '../../runtime/sanitize.js';

Gio._promisify(
  Gio.DataInputStream.prototype,
  'read_line_async',
  'read_line_finish',
);

interface RpcErrorPayload {
  code?: number;
  data?: unknown;
  message?: string;
}

interface RpcMessage {
  id?: number;
  result?: unknown;
  error?: RpcErrorPayload;
}

export interface CodexRpcResults {
  account: unknown;
  rateLimits: unknown;
}

export class CodexRpcError extends Error {
  readonly accountResponse?: unknown;
  readonly payload: RpcErrorPayload;

  constructor(payload: RpcErrorPayload, accountResponse?: unknown) {
    super(payload.message || 'Codex app-server RPC failed');
    this.name = 'CodexRpcError';
    this.payload = payload;
    this.accountResponse = accountResponse;
  }
}

const REQUEST_TIMEOUT_MS = 20_000;
const MAX_STDERR_CHARS = 16_384;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export class CodexAppServerClient {
  readonly #runner: CommandRunner;

  constructor(runner: CommandRunner) {
    this.#runner = runner;
  }

  async collect(
    executable: string,
    callerCancellable: Gio.Cancellable,
  ): Promise<CodexRpcResults> {
    const process = this.#runner.createProcess([
      executable,
      'app-server',
      '--listen',
      'stdio://',
    ]);
    const cancellable = new Gio.Cancellable();
    let timedOut = false;
    const callerSignalId = callerCancellable.connect(() => {
      cancellable.cancel();
      process.force_exit();
    });
    const timeoutSourceId = GLib.timeout_add(
      GLib.PRIORITY_DEFAULT,
      REQUEST_TIMEOUT_MS,
      () => {
        timedOut = true;
        cancellable.cancel();
        process.force_exit();
        return GLib.SOURCE_REMOVE;
      },
    );
    const stdout = new Gio.DataInputStream({
      baseStream: process.get_stdout_pipe()!,
    });
    const stderr = new Gio.DataInputStream({
      baseStream: process.get_stderr_pipe()!,
    });
    const stderrState = {text: ''};
    const stderrTask = drainStderr(stderr, stderrState);

    try {
      await this.#send(process, {
        id: 1,
        method: 'initialize',
        params: {
          clientInfo: {
            name: 'quota-glance',
            version: '0.1.0',
          },
          capabilities: {experimentalApi: true},
        },
      }, cancellable);
      await readResponse(stdout, 1, cancellable, process, stderrState);
      await this.#send(process, {method: 'initialized'}, cancellable);

      await this.#send(process, {
        id: 2,
        method: 'account/read',
        params: {},
      }, cancellable);
      const account = await readResponse(
        stdout,
        2,
        cancellable,
        process,
        stderrState,
      );

      await this.#send(process, {
        id: 3,
        method: 'account/rateLimits/read',
        params: null,
      }, cancellable);
      let rateLimits: unknown;
      try {
        rateLimits = await readResponse(
          stdout,
          3,
          cancellable,
          process,
          stderrState,
        );
      } catch (caught) {
        if (caught instanceof CodexRpcError)
          throw new CodexRpcError(caught.payload, account);
        throw caught;
      }
      return {account, rateLimits};
    } catch (caught) {
      if (caught instanceof CodexRpcError)
        throw caught;
      if (timedOut) {
        throw new ProviderRuntimeError(
          'timeout',
          'Codex app-server timed out',
          {cause: caught},
        );
      }
      if (callerCancellable.is_cancelled()) {
        throw new ProviderRuntimeError(
          'cancelled',
          'Codex refresh was cancelled',
          {cause: caught},
        );
      }
      if (caught instanceof ProviderRuntimeError)
        throw caught;
      throw new ProviderRuntimeError(
        'process-exited',
        'Codex app-server failed',
        {
          cause: caught,
          debugMessage: sanitizeSensitiveText(
            `${String(caught)} ${stderrState.text}`,
          ),
        },
      );
    } finally {
      if (GLib.MainContext.default().find_source_by_id(timeoutSourceId))
        GLib.source_remove(timeoutSourceId);
      callerCancellable.disconnect(callerSignalId);
      process.force_exit();
      this.#runner.releaseProcess(process);
      try {
        await stderrTask;
      } catch {
        // The stream normally closes when the short-lived server is stopped.
      }
    }
  }

  async #send(
    process: Gio.Subprocess,
    payload: Record<string, unknown>,
    cancellable: Gio.Cancellable,
  ): Promise<void> {
    const stdin = process.get_stdin_pipe()!;
    const bytes = encoder.encode(`${JSON.stringify(payload)}\n`);
    await new Promise<void>((resolve, reject) => {
      stdin.write_all_async(
        bytes,
        GLib.PRIORITY_DEFAULT,
        cancellable,
        (_stream, result) => {
          try {
            stdin.write_all_finish(result);
            resolve();
          } catch (caught) {
            reject(caught);
          }
        },
      );
    });
  }
}

async function readResponse(
  stream: Gio.DataInputStream,
  requestId: number,
  cancellable: Gio.Cancellable,
  process: Gio.Subprocess,
  stderr: {text: string},
): Promise<unknown> {
  while (true) {
    const [line] = await stream.read_line_async(
      GLib.PRIORITY_DEFAULT,
      cancellable,
    );
    if (line === null) {
      throw new ProviderRuntimeError(
        'process-exited',
        'Codex app-server exited before replying',
        {debugMessage: sanitizeSensitiveText(stderr.text)},
      );
    }

    let message: RpcMessage;
    try {
      message = JSON.parse(decoder.decode(line)) as RpcMessage;
    } catch (caught) {
      process.force_exit();
      throw new ProviderRuntimeError(
        'invalid-response',
        'Codex app-server returned invalid JSON',
        {cause: caught, retryable: false},
      );
    }
    if (message.id !== requestId)
      continue;
    if (message.error)
      throw new CodexRpcError(message.error);
    return message.result;
  }
}

async function drainStderr(
  stream: Gio.DataInputStream,
  state: {text: string},
): Promise<void> {
  while (true) {
    const [line] = await stream.read_line_async(
      GLib.PRIORITY_DEFAULT,
      null,
    );
    if (line === null)
      return;
    state.text = `${state.text}\n${decoder.decode(line)}`.slice(
      -MAX_STDERR_CHARS,
    );
  }
}
