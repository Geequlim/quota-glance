import type Gio from 'gi://Gio';

import {
  effectiveData,
  isStale,
  type UsageProvider,
} from '../../core/provider.js';
import type {
  PanelItem,
  ProviderState,
  ProviderViewModel,
} from '../../core/types.js';
import {ProviderRuntimeError} from '../../runtime/errors.js';
import type {Translator} from '../../shared/i18n/index.js';
import type {HttpProviderDependencies} from '../http-dependencies.js';
import {
  currencySymbol,
  parseDeepSeekResponse,
  selectActiveBalance,
  type DeepSeekData,
} from './parser.js';

const ENDPOINT = 'https://api.deepseek.com/user/balance';

export class DeepSeekProvider implements UsageProvider<DeepSeekData> {
  readonly id = 'deepseek';
  readonly name = 'DeepSeek';
  readonly order = 50;
  readonly enabledByDefault = false;
  readonly #dependencies: HttpProviderDependencies;
  readonly #translator: Translator;

  constructor(
    dependencies: HttpProviderDependencies,
    translator: Translator,
  ) {
    this.#dependencies = dependencies;
    this.#translator = translator;
  }

  async collect(cancellable: Gio.Cancellable): Promise<DeepSeekData> {
    const apiKey = this.#dependencies.environment.DEEPSEEK_API_KEY;
    if (!apiKey) {
      throw new ProviderRuntimeError(
        'missing-config',
        this.#translator.t('error.deepseek.missingKey'),
        {localized: true, retryable: false},
      );
    }

    const payload = await this.#dependencies.http.requestJson<unknown>({
      method: 'GET',
      url: ENDPOINT,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'User-Agent': 'Quota-Glance/0.1',
      },
    }, cancellable);
    return parseDeepSeekResponse(payload);
  }

  getPanelItems(state: ProviderState<DeepSeekData>): PanelItem[] {
    const balance = selectActiveBalanceOrNull(state);
    return [{
      text: balance
        ? formatBalance(
          balance.currency,
          balance.totalBalance,
          this.#translator,
        )
        : '--',
      priority: 40,
    }];
  }

  getPopupViewModel(
    state: ProviderState<DeepSeekData>,
  ): ProviderViewModel {
    const data = effectiveData(state);
    return {
      title: 'DeepSeek',
      subtitle: data && !data.isAvailable
        ? this.#translator.t('provider.common.unavailable')
        : undefined,
      metrics: data?.balances.map(balance => ({
        id: balance.currency,
        label: balance.currency,
        value: formatBalance(
          balance.currency,
          balance.totalBalance,
          this.#translator,
        ),
      })) ?? [],
      details: data?.balances.map(balance =>
        this.#translator.t('provider.deepseek.grantedTopup', {
          granted: formatMoney(balance.grantedBalance, this.#translator),
          toppedUp: formatMoney(balance.toppedUpBalance, this.#translator),
        })) ?? [],
      footer: isStale(state)
        ? this.#translator.t('provider.common.showingLastData')
        : undefined,
      phase: state.phase,
      stale: isStale(state),
      error: state.error ?? undefined,
    };
  }

  dispose(): void {}
}

function selectActiveBalanceOrNull(state: ProviderState<DeepSeekData>) {
  const data = effectiveData(state);
  return data ? selectActiveBalance(data) : null;
}

function formatBalance(
  currency: string,
  amount: string,
  translator: Translator,
): string {
  return `${currencySymbol(currency)}${formatMoney(amount, translator)}`;
}

function formatMoney(value: string, translator: Translator): string {
  const number = Number(value);
  return new Intl.NumberFormat(translator.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(number) ? number : 0);
}
