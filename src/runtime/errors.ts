import type {
  ProviderError,
  ProviderErrorCode,
} from '../core/types.js';

export class ProviderRuntimeError extends Error {
  readonly code: ProviderErrorCode;
  readonly debugMessage?: string;
  readonly localized: boolean;
  readonly retryable: boolean;

  constructor(
    code: ProviderErrorCode,
    message: string,
    options: {
      cause?: unknown;
      debugMessage?: string;
      localized?: boolean;
      retryable?: boolean;
    } = {},
  ) {
    super(message, {cause: options.cause});
    this.name = 'ProviderRuntimeError';
    this.code = code;
    this.debugMessage = options.debugMessage;
    this.localized = options.localized ?? false;
    this.retryable = options.retryable ?? true;
  }

  toProviderError(): ProviderError {
    return {
      code: this.code,
      message: this.message,
      debugMessage: this.debugMessage,
      localized: this.localized,
      retryable: this.retryable,
    };
  }
}

export function normalizeProviderError(caught: unknown): ProviderError {
  if (caught instanceof ProviderRuntimeError)
    return caught.toProviderError();

  if (caught instanceof Error) {
    return {
      code: 'internal',
      message: caught.message,
      debugMessage: caught.stack,
      retryable: true,
    };
  }

  return {
    code: 'internal',
    message: String(caught),
    retryable: true,
  };
}
