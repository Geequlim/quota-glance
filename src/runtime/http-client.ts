import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

import {ProviderRuntimeError} from './errors.js';
import type {RuntimeEnvironment} from './environment-parser.js';
import {sanitizeSensitiveText} from './sanitize.js';

Gio._promisify(
  Soup.Session.prototype,
  'send_and_read_async',
  'send_and_read_finish',
);

export interface HttpRequest {
  method: 'GET' | 'POST';
  url: string;
  headers?: Record<string, string>;
  body?: Uint8Array | string;
  timeoutMs?: number;
  maxResponseBytes?: number;
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: Uint8Array;
}

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024;
const decoder = new TextDecoder();
const encoder = new TextEncoder();

export class HttpClient {
  readonly #session: Soup.Session;
  #disposed = false;

  constructor(environment: RuntimeEnvironment = {}) {
    this.#session = new Soup.Session();
    const httpProxy = environment.HTTP_PROXY ?? environment.http_proxy;
    const httpsProxy = environment.HTTPS_PROXY ?? environment.https_proxy;
    if (httpProxy || httpsProxy) {
      const noProxy = (environment.NO_PROXY ?? environment.no_proxy)
        ?.split(',')
        .map(host => host.trim())
        .filter(Boolean) ?? null;
      const resolver = Gio.SimpleProxyResolver.new(
        null,
        noProxy,
      ) as Gio.SimpleProxyResolver;
      if (httpProxy)
        resolver.set_uri_proxy('http', httpProxy);
      if (httpsProxy)
        resolver.set_uri_proxy('https', httpsProxy);
      this.#session.proxyResolver = resolver;
    }
  }

  async request(
    request: HttpRequest,
    callerCancellable: Gio.Cancellable,
  ): Promise<HttpResponse> {
    if (this.#disposed) {
      throw new ProviderRuntimeError(
        'internal',
        'HTTP client has been disposed',
        {retryable: false},
      );
    }

    const message = Soup.Message.new(request.method, request.url);
    const secretValues = sensitiveHeaderValues(request.headers);
    for (const [name, value] of Object.entries(request.headers ?? {}))
      message.requestHeaders.append(name, value);

    if (request.body !== undefined) {
      const body = typeof request.body === 'string'
        ? encoder.encode(request.body)
        : request.body;
      message.set_request_body_from_bytes(
        request.headers?.['Content-Type'] ?? 'application/octet-stream',
        new GLib.Bytes(body),
      );
    }

    const maxResponseBytes =
      request.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;
    const requestCancellable = new Gio.Cancellable();
    let exceededSizeLimit = false;
    let timedOut = false;

    const callerSignalId = callerCancellable.connect(
      () => requestCancellable.cancel(),
    );
    message.connect('got-headers', () => {
      const contentLength = message.responseHeaders.get_content_length();
      if (contentLength > maxResponseBytes) {
        exceededSizeLimit = true;
        requestCancellable.cancel();
      }
    });

    const timeoutSourceId = GLib.timeout_add(
      GLib.PRIORITY_DEFAULT,
      request.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      () => {
        timedOut = true;
        requestCancellable.cancel();
        return GLib.SOURCE_REMOVE;
      },
    );

    try {
      const bytes = await this.#session.send_and_read_async(
        message,
        GLib.PRIORITY_DEFAULT,
        requestCancellable,
      );
      const body = bytes.get_data() ?? new Uint8Array();
      if (body.byteLength > maxResponseBytes) {
        throw new ProviderRuntimeError(
          'invalid-response',
          `Response exceeded ${maxResponseBytes} bytes`,
          {retryable: false},
        );
      }

      const response: HttpResponse = {
        status: message.statusCode,
        headers: readHeaders(message.responseHeaders),
        body,
      };
      if (response.status < 200 || response.status >= 300)
        throwHttpStatus(response, secretValues);

      return response;
    } catch (caught) {
      if (caught instanceof ProviderRuntimeError)
        throw caught;
      if (exceededSizeLimit) {
        throw new ProviderRuntimeError(
          'invalid-response',
          `Response exceeded ${maxResponseBytes} bytes`,
          {cause: caught, retryable: false},
        );
      }
      if (timedOut) {
        throw new ProviderRuntimeError(
          'timeout',
          'HTTP request timed out',
          {cause: caught},
        );
      }
      if (callerCancellable.is_cancelled()) {
        throw new ProviderRuntimeError(
          'cancelled',
          'HTTP request was cancelled',
          {cause: caught},
        );
      }

      throw new ProviderRuntimeError(
        'http',
        'Network request failed',
        {
          cause: caught,
          debugMessage: sanitizeSensitiveText(caught, secretValues),
        },
      );
    } finally {
      if (GLib.MainContext.default().find_source_by_id(timeoutSourceId))
        GLib.source_remove(timeoutSourceId);
      callerCancellable.disconnect(callerSignalId);
    }
  }

  async requestText(
    request: HttpRequest,
    cancellable: Gio.Cancellable,
  ): Promise<string> {
    const response = await this.request(request, cancellable);
    return decoder.decode(response.body);
  }

  async requestJson<T>(
    request: HttpRequest,
    cancellable: Gio.Cancellable,
  ): Promise<T> {
    const response = await this.request(request, cancellable);
    const text = decoder.decode(response.body);
    try {
      return JSON.parse(text) as T;
    } catch (caught) {
      throw new ProviderRuntimeError(
        'invalid-response',
        'Server returned invalid JSON',
        {
          cause: caught,
          debugMessage: sanitizeSensitiveText(caught),
          retryable: false,
        },
      );
    }
  }

  dispose(): void {
    if (this.#disposed)
      return;
    this.#disposed = true;
    this.#session.abort();
  }
}

function readHeaders(headers: Soup.MessageHeaders): Record<string, string> {
  const result: Record<string, string> = {};
  headers.foreach((name, value) => {
    result[name.toLowerCase()] = value;
  });
  return result;
}

function sensitiveHeaderValues(
  headers: Record<string, string> | undefined,
): string[] {
  return Object.entries(headers ?? {})
    .filter(([name]) =>
      /authorization|cookie|api[-_]?key|token|secret/i.test(name))
    .map(([, value]) => value);
}

function throwHttpStatus(
  response: HttpResponse,
  secretValues: readonly string[],
): never {
  const body = sanitizeSensitiveText(
    decoder.decode(response.body),
    secretValues,
    160,
  );
  const authenticationFailure =
    response.status === 401 || response.status === 403;

  throw new ProviderRuntimeError(
    authenticationFailure ? 'not-authenticated' : 'http',
    authenticationFailure
      ? `Authentication failed (HTTP ${response.status})`
      : `HTTP ${response.status}: ${body}`,
    {retryable: !authenticationFailure},
  );
}
