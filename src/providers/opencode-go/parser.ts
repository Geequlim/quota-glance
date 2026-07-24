import {ProviderRuntimeError} from '../../runtime/errors.js';

export interface OpenCodeWindow {
  usagePercent: number;
  percentRemaining: number;
  resetInSeconds: number;
  resetAt: number;
}

export interface OpenCodeData {
  rolling: OpenCodeWindow | null;
  weekly: OpenCodeWindow | null;
  monthly: OpenCodeWindow | null;
}

export type OpenCodeWindowKind = keyof OpenCodeData;

const NUMBER = String.raw`(-?\d+(?:\.\d+)?)`;

export function parseOpenCodePage(
  html: string,
  now = Date.now(),
): OpenCodeData {
  const data: OpenCodeData = {
    rolling: parseWindow(html, 'rollingUsage', now),
    weekly: parseWindow(html, 'weeklyUsage', now),
    monthly: parseWindow(html, 'monthlyUsage', now),
  };

  if (!data.rolling && !data.weekly && !data.monthly) {
    throw new ProviderRuntimeError(
      'invalid-response',
      'Unable to parse the current OpenCode Go page',
      {retryable: false},
    );
  }
  return data;
}

export function buildOpenCodeCookie(value: string): string {
  const trimmed = value.trim();
  if (!trimmed)
    return '';
  return trimmed.includes('auth=') || trimmed.includes(';')
    ? trimmed
    : `auth=${trimmed}`;
}

export function minimumLongTermRemaining(
  data: OpenCodeData,
): number | null {
  const values = [data.weekly, data.monthly]
    .filter((window): window is OpenCodeWindow => window !== null)
    .map(window => window.percentRemaining);
  return values.length > 0 ? Math.min(...values) : null;
}

function parseWindow(
  html: string,
  field: string,
  now: number,
): OpenCodeWindow | null {
  const objectPrefix = `${escapeRegex(field)}:\\$R\\[\\d+\\]=\\{[^}]*`;
  const percentageFirst = new RegExp(
    `${objectPrefix}usagePercent:${NUMBER}[^}]*resetInSec:${NUMBER}[^}]*\\}`,
  );
  const resetFirst = new RegExp(
    `${objectPrefix}resetInSec:${NUMBER}[^}]*usagePercent:${NUMBER}[^}]*\\}`,
  );
  const percentageMatch = percentageFirst.exec(html);
  const resetMatch = percentageMatch ? null : resetFirst.exec(html);
  if (!percentageMatch && !resetMatch)
    return null;

  const usagePercent = Math.max(
    0,
    Number(percentageMatch?.[1] ?? resetMatch?.[2]),
  );
  const resetInSeconds = Math.max(
    0,
    Number(percentageMatch?.[2] ?? resetMatch?.[1]),
  );
  return {
    usagePercent,
    percentRemaining: Math.max(0, 100 - usagePercent),
    resetInSeconds,
    resetAt: Math.round(now + resetInSeconds * 1000),
  };
}

function escapeRegex(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
