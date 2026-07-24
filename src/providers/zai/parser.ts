import {ProviderRuntimeError} from '../../runtime/errors.js';

export interface ZaiLimit {
  type: string;
  unit: number | null;
  number: number | null;
  usage: number | null;
  currentValue: number | null;
  percentage: number | null;
  nextResetTime: number | null;
}

export interface ZaiData {
  success: boolean;
  code: string;
  message: string;
  level: string;
  limits: ZaiLimit[];
}

export type ZaiWindowKind = '5h' | '7d';

export function parseZaiResponse(payload: unknown): ZaiData {
  if (!isRecord(payload) || !isRecord(payload.data) ||
      !Array.isArray(payload.data.limits)) {
    throw new ProviderRuntimeError(
      'invalid-response',
      'Z.ai returned an unexpected response',
      {retryable: false},
    );
  }

  return {
    success: Boolean(payload.success),
    code: stringValue(payload.code),
    message: stringValue(payload.msg),
    level: stringValue(payload.data.level),
    limits: payload.data.limits.filter(isRecord).map(limit => ({
      type: stringValue(limit.type) || 'LIMIT',
      unit: numberValue(limit.unit),
      number: numberValue(limit.number),
      usage: numberValue(limit.usage),
      currentValue: numberValue(limit.currentValue),
      percentage: numberValue(limit.percentage),
      nextResetTime: numberValue(limit.nextResetTime),
    })),
  };
}

export function classifyZaiWindow(
  limit: ZaiLimit,
  now = Date.now(),
): ZaiWindowKind | null {
  if (limit.type === 'TOKENS_LIMIT' && limit.unit === 3 && limit.number === 5)
    return '5h';
  if (limit.type === 'TOKENS_LIMIT' && limit.unit === 6 && limit.number === 1)
    return '7d';

  const type = limit.type.toUpperCase();
  if (type.includes('WEEK') || type.includes('7D'))
    return '7d';
  if (type === 'TOKENS_LIMIT')
    return '5h';

  if (limit.nextResetTime !== null) {
    const deltaHours = (normalizeEpochMs(limit.nextResetTime) - now) / 3_600_000;
    if (deltaHours > 0 && deltaHours <= 12)
      return '5h';
    if (deltaHours >= 72)
      return '7d';
  }
  return null;
}

export function remainingPercentage(limit: ZaiLimit): number | null {
  return limit.percentage === null
    ? null
    : Math.max(0, Math.min(100, 100 - Math.round(limit.percentage)));
}

export function normalizeEpochMs(value: number): number {
  return value < 10_000_000_000 ? value * 1000 : value;
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringValue(value: unknown): string {
  if (typeof value === 'string')
    return value;
  if (typeof value === 'number')
    return String(value);
  return '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
