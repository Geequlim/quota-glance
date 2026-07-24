import type Gio from 'gi://Gio';

import {
  effectiveData,
  isStale,
  type UsageProvider,
} from '../../core/provider.js';
import type {
  MetricViewModel,
  PanelItem,
  ProviderState,
  ProviderViewModel,
} from '../../core/types.js';
import {ProviderRuntimeError} from '../../runtime/errors.js';
import {CommandRunner} from '../../runtime/command-runner.js';
import type {Translator} from '../../shared/i18n/index.js';
import {
  copilotQuotaPercent,
  isDisplayableCopilotQuota,
  parseCopilotResponse,
  type CopilotData,
  type CopilotQuota,
} from './parser.js';

const HEADERS = [
  'Accept: application/json',
  'Editor-Version: vscode/1.96.2',
  'X-Github-Api-Version: 2025-04-01',
];

export class CopilotProvider implements UsageProvider<CopilotData> {
  readonly id = 'copilot';
  readonly name = 'GitHub Copilot';
  readonly order = 20;
  readonly enabledByDefault = true;
  readonly #runner: CommandRunner;
  readonly #translator: Translator;

  constructor(runner: CommandRunner, translator: Translator) {
    this.#runner = runner;
    this.#translator = translator;
  }

  async collect(cancellable: Gio.Cancellable): Promise<CopilotData> {
    const executable = this.#runner.findExecutable('gh');
    if (!executable) {
      throw new ProviderRuntimeError(
        'executable-not-found',
        this.#translator.t('error.copilot.missingCli'),
        {localized: true, retryable: false},
      );
    }

    const argv = [executable, 'api'];
    for (const header of HEADERS)
      argv.push('-H', header);
    argv.push('/copilot_internal/user');
    const result = await this.#runner.run(argv, cancellable);
    try {
      return parseCopilotResponse(JSON.parse(result.stdout));
    } catch (caught) {
      if (caught instanceof ProviderRuntimeError)
        throw caught;
      throw new ProviderRuntimeError(
        'invalid-response',
        'GitHub Copilot returned invalid JSON',
        {
          cause: caught,
          debugMessage: result.stdout.slice(0, 240),
          retryable: false,
        },
      );
    }
  }

  getPanelItems(state: ProviderState<CopilotData>): PanelItem[] {
    const data = effectiveData(state);
    const quota = data?.quotas.premium_interactions;
    const percent = isDisplayableCopilotQuota(quota)
      ? copilotQuotaPercent(quota)
      : null;
    return [{
      text: percent === null ? '--' : `${Math.round(percent)}%`,
      priority: 20,
    }];
  }

  getPopupViewModel(
    state: ProviderState<CopilotData>,
  ): ProviderViewModel {
    const data = effectiveData(state);
    return {
      title: 'GitHub Copilot',
      subtitle: data
        ? data.login || this.#translator.t('provider.common.unknownAccount')
        : undefined,
      badge: data
        ? data.plan
          ? formatPlan(data.plan)
          : this.#translator.t('provider.common.unknownPlan')
        : undefined,
      metrics: data ? createMetrics(data, this.#translator) : [],
      details: data ? createDetails(data, this.#translator) : [],
      footer: isStale(state)
        ? this.#translator.t('provider.common.showingLastData')
        : undefined,
      phase: state.phase,
      stale: isStale(state),
      error: state.error ?? undefined,
    };
  }

  dispose(): void {
    this.#runner.dispose();
  }
}

function createMetrics(
  data: CopilotData,
  translator: Translator,
): MetricViewModel[] {
  const preferred = [
    ['premium_interactions', 'provider.copilot.metric.premium'],
    ['chat', 'provider.copilot.metric.chat'],
    ['completions', 'provider.copilot.metric.completions'],
  ] as const;
  return preferred
    .map(([id, labelKey]) => quotaMetric(
      data.quotas[id],
      id,
      translator.t(labelKey),
      data.resetAt,
      translator,
    ))
    .filter((metric): metric is MetricViewModel => metric !== null);
}

function quotaMetric(
  quota: CopilotQuota | undefined,
  id: string,
  label: string,
  fallbackResetAt: number | null,
  translator: Translator,
): MetricViewModel | null {
  if (!isDisplayableCopilotQuota(quota))
    return null;
  const percent = copilotQuotaPercent(quota);
  const detail = quota.remaining !== null && quota.entitlement !== null
    ? translator.t('provider.common.remaining', {
      remaining: quota.remaining.toLocaleString(translator.locale),
      total: quota.entitlement.toLocaleString(translator.locale),
    })
    : undefined;
  return {
    id,
    label,
    value: percent === null ? '--' : `${Math.round(percent)}%`,
    progress: percent === null ? undefined : percent / 100,
    detail,
    resetAt: quota.resetAt ?? fallbackResetAt ?? undefined,
  };
}

function createDetails(
  data: CopilotData,
  translator: Translator,
): string[] {
  const known = new Set(['premium_interactions', 'chat', 'completions']);
  return Object.values(data.quotas)
    .filter(quota =>
      !known.has(quota.id) && isDisplayableCopilotQuota(quota))
    .map(quota => `${quota.id.replaceAll('_', ' ')}: ${
      quota.remaining?.toLocaleString(translator.locale) ?? '--'
    }`);
}

function formatPlan(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, char =>
    char.toUpperCase());
}
