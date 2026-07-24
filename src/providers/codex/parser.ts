import {ProviderRuntimeError} from '../../runtime/errors.js';

export interface CodexWindow {
  usedPercent: number | null;
  durationMinutes: number | null;
  resetAt: number | null;
}

export interface CodexCredits {
  balance: string | number | null;
  unlimited: boolean;
}

export interface CodexData {
  email: string;
  plan: string;
  primary: CodexWindow | null;
  secondary: CodexWindow | null;
  credits: CodexCredits | null;
}

export function parseCodexResponses(
  accountResponse: unknown,
  rateLimitsResponse: unknown,
): CodexData {
  const accountRoot = recordValue(accountResponse);
  const account = recordValue(accountRoot.account);
  const rateRoot = recordValue(rateLimitsResponse);
  const buckets = recordValue(rateRoot.rateLimitsByLimitId);
  const rateLimit = recordValue(
    buckets.codex ?? rateRoot.rateLimits ?? rateLimitsResponse,
  );
  const primary = normalizeWindow(rateLimit.primary);
  const secondary = normalizeWindow(rateLimit.secondary);
  if (!primary && !secondary && Object.keys(rateLimit).length === 0) {
    throw new ProviderRuntimeError(
      'invalid-response',
      'Codex returned no rate-limit data',
      {retryable: false},
    );
  }

  return {
    email: stringValue(account.email),
    plan: stringValue(rateLimit.planType) ||
      stringValue(account.planType) ||
      '',
    primary,
    secondary,
    credits: normalizeCredits(rateLimit.credits),
  };
}

export function parseCodexErrorFallback(
  errorPayload: unknown,
  accountResponse: unknown,
): CodexData | null {
  const text = errorText(errorPayload);
  const body = extractJsonObject(text, 'body=');
  if (!body)
    return null;

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return null;
  }
  const root = recordValue(payload);
  const rateLimit = recordValue(root.rate_limit);
  if (Object.keys(rateLimit).length === 0)
    return null;

  const accountRoot = recordValue(accountResponse);
  const account = recordValue(accountRoot.account);
  return {
    email: stringValue(account.email) ||
      stringValue(root.email) ||
      '',
    plan: stringValue(root.plan_type) ||
      stringValue(account.planType) ||
      '',
    primary: normalizeWhamWindow(recordValue(rateLimit.primary_window)),
    secondary: normalizeWhamWindow(recordValue(rateLimit.secondary_window)),
    credits: normalizeCredits(root.credits),
  };
}

export function remainingCodexPercent(
  window: CodexWindow | null,
): number | null {
  return window?.usedPercent === null || window?.usedPercent === undefined
    ? null
    : Math.max(0, Math.min(100, 100 - window.usedPercent));
}

function normalizeWindow(value: unknown): CodexWindow | null {
  if (!isRecord(value))
    return null;
  return {
    usedPercent: percentageValue(value.usedPercent),
    durationMinutes: numberValue(value.windowDurationMins),
    resetAt: epochMilliseconds(value.resetsAt),
  };
}

function normalizeWhamWindow(value: Record<string, unknown>): CodexWindow | null {
  if (Object.keys(value).length === 0)
    return null;
  const durationSeconds = numberValue(value.limit_window_seconds);
  return {
    usedPercent: percentageValue(value.used_percent),
    durationMinutes: durationSeconds === null
      ? null
      : Math.floor(durationSeconds / 60),
    resetAt: epochMilliseconds(value.reset_at),
  };
}

function normalizeCredits(value: unknown): CodexCredits | null {
  if (!isRecord(value))
    return null;
  const balance = value.balance;
  return {
    balance: typeof balance === 'string' || typeof balance === 'number'
      ? balance
      : null,
    unlimited: value.unlimited === true,
  };
}

function extractJsonObject(text: string, marker: string): string | null {
  const markerIndex = text.indexOf(marker);
  const start = text.indexOf('{', markerIndex + marker.length);
  if (markerIndex < 0 || start < 0)
    return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index++) {
    const char = text[index];
    if (inString) {
      if (escaped)
        escaped = false;
      else if (char === '\\')
        escaped = true;
      else if (char === '"')
        inString = false;
      continue;
    }
    if (char === '"')
      inString = true;
    else if (char === '{')
      depth++;
    else if (char === '}' && --depth === 0)
      return text.slice(start, index + 1);
  }
  return null;
}

function errorText(value: unknown): string {
  if (typeof value === 'string')
    return value;
  if (isRecord(value)) {
    const parts = [
      stringValue(value.message),
      typeof value.data === 'string'
        ? value.data
        : JSON.stringify(value.data ?? ''),
    ];
    return parts.join(' ');
  }
  return String(value ?? '');
}

function percentageValue(value: unknown): number | null {
  const number = numberValue(value);
  return number === null ? null : Math.max(0, Math.min(100, number));
}

function epochMilliseconds(value: unknown): number | null {
  const number = numberValue(value);
  if (number !== null)
    return number < 10_000_000_000 ? number * 1000 : number;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function recordValue(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
