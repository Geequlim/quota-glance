import {ProviderRuntimeError} from '../../runtime/errors.js';

export interface CopilotQuota {
  id: string;
  entitlement: number | null;
  remaining: number | null;
  percentRemaining: number | null;
  unlimited: boolean;
  resetAt: number | null;
}

export interface CopilotData {
  login: string;
  plan: string;
  resetAt: number | null;
  quotas: Record<string, CopilotQuota>;
}

export function parseCopilotResponse(payload: unknown): CopilotData {
  if (!isRecord(payload) || !isRecord(payload.quota_snapshots)) {
    throw new ProviderRuntimeError(
      'invalid-response',
      'GitHub Copilot returned an unexpected response',
      {retryable: false},
    );
  }

  const quotas: Record<string, CopilotQuota> = {};
  for (const [id, value] of Object.entries(payload.quota_snapshots)) {
    if (!isRecord(value))
      continue;
    const entitlement = numberValue(value.entitlement);
    const remaining = numberValue(value.remaining);
    const suppliedPercent = numberValue(value.percent_remaining);
    quotas[id] = {
      id: stringValue(value.quota_id) || id,
      entitlement,
      remaining,
      percentRemaining: clampPercentage(
        suppliedPercent ?? (
          remaining !== null && entitlement !== null && entitlement > 0
            ? remaining / entitlement * 100
            : null
        ),
      ),
      unlimited: value.unlimited === true,
      resetAt: parseTimestamp(value.timestamp_utc),
    };
  }

  return {
    login: stringValue(payload.login),
    plan: stringValue(payload.copilot_plan),
    resetAt: parseTimestamp(
      payload.quota_reset_date_utc ?? payload.quota_reset_date,
    ),
    quotas,
  };
}

export function copilotQuotaPercent(
  quota: CopilotQuota | undefined,
): number | null {
  if (!quota)
    return null;
  if (quota.unlimited)
    return 100;
  return quota.percentRemaining;
}

export function isDisplayableCopilotQuota(
  quota: CopilotQuota | undefined,
): quota is CopilotQuota {
  return Boolean(quota && !quota.unlimited);
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value !== 'string' || !value)
    return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampPercentage(value: number | null): number | null {
  return value === null ? null : Math.max(0, Math.min(100, value));
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
