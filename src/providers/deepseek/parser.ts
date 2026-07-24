import {ProviderRuntimeError} from '../../runtime/errors.js';

export interface DeepSeekBalance {
  currency: string;
  totalBalance: string;
  grantedBalance: string;
  toppedUpBalance: string;
}

export interface DeepSeekData {
  isAvailable: boolean;
  balances: DeepSeekBalance[];
}

export function parseDeepSeekResponse(payload: unknown): DeepSeekData {
  if (!isRecord(payload) || !Array.isArray(payload.balance_infos)) {
    throw new ProviderRuntimeError(
      'invalid-response',
      'DeepSeek returned an unexpected response',
      {retryable: false},
    );
  }

  return {
    isAvailable: Boolean(payload.is_available),
    balances: payload.balance_infos
      .filter(isRecord)
      .map(balance => ({
        currency: stringValue(balance.currency) || '--',
        totalBalance: amountValue(balance.total_balance),
        grantedBalance: amountValue(balance.granted_balance),
        toppedUpBalance: amountValue(balance.topped_up_balance),
      })),
  };
}

export function selectActiveBalance(
  data: DeepSeekData,
): DeepSeekBalance | null {
  return data.balances.find(balance =>
    Number(balance.totalBalance) > 0) ?? data.balances[0] ?? null;
}

export function currencySymbol(currency: string): string {
  if (currency === 'CNY')
    return '¥';
  if (currency === 'USD')
    return '$';
  return `${currency} `;
}

function amountValue(value: unknown): string {
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : '0';
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
