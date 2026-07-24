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
import type {Translator} from '../../shared/i18n/index.js';
import type {HttpProviderDependencies} from '../http-dependencies.js';
import {
  classifyZaiWindow,
  normalizeEpochMs,
  parseZaiResponse,
  remainingPercentage,
  type ZaiData,
  type ZaiLimit,
  type ZaiWindowKind,
} from './parser.js';

const ENDPOINT = 'https://api.z.ai/api/monitor/usage/quota/limit';

export class ZaiProvider implements UsageProvider<ZaiData> {
  readonly id = 'zai';
  readonly name = 'Z.ai';
  readonly order = 30;
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

  async collect(cancellable: Gio.Cancellable): Promise<ZaiData> {
    const apiKey = this.#dependencies.environment.Z_AI_API_KEY;
    if (!apiKey) {
      throw new ProviderRuntimeError(
        'missing-config',
        this.#translator.t('error.zai.missingKey'),
        {localized: true, retryable: false},
      );
    }

    const payload = await this.#dependencies.http.requestJson<unknown>({
      method: 'GET',
      url: ENDPOINT,
      headers: {
        Accept: 'application/json',
        Authorization: apiKey,
        'User-Agent': 'Quota-Glance/0.1',
      },
    }, cancellable);
    return parseZaiResponse(payload);
  }

  getPanelItems(state: ProviderState<ZaiData>): PanelItem[] {
    const data = effectiveData(state);
    const windows = data ? selectWindows(data.limits) : new Map();
    const limit = windows.get('7d') ?? windows.get('5h') ?? data?.limits[0];
    const remaining = limit ? remainingPercentage(limit) : null;
    return [{
      text: remaining === null ? '--' : `${remaining}%`,
      priority: 30,
    }];
  }

  getPopupViewModel(state: ProviderState<ZaiData>): ProviderViewModel {
    const data = effectiveData(state);
    return {
      title: this.#translator.t('provider.zai.title'),
      badge: data
        ? formatPlan(data.level) ||
          this.#translator.t('provider.common.unknownPlan')
        : undefined,
      metrics: data ? createMetrics(data, this.#translator) : [],
      details: [],
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

function createMetrics(
  data: ZaiData,
  translator: Translator,
): MetricViewModel[] {
  const windows = selectWindows(data.limits);
  const selected = windows.size > 0
    ? [...windows.entries()]
    : data.limits.map((limit, index) => [`limit-${index}`, limit] as const);

  return selected.map(([kind, limit]) => {
    const remaining = remainingPercentage(limit);
    return {
      id: kind,
      label: windowLabel(kind, limit, translator),
      value: remaining === null ? '--' : `${remaining}%`,
      progress: remaining === null ? undefined : remaining / 100,
      resetAt: limit.nextResetTime === null
        ? undefined
        : normalizeEpochMs(limit.nextResetTime),
    };
  });
}

function selectWindows(
  limits: ZaiLimit[],
): Map<ZaiWindowKind, ZaiLimit> {
  const windows = new Map<ZaiWindowKind, ZaiLimit>();
  for (const limit of limits) {
    const kind = classifyZaiWindow(limit);
    if (kind && !windows.has(kind))
      windows.set(kind, limit);
  }
  return windows;
}

function windowLabel(
  kind: string,
  limit: ZaiLimit,
  translator: Translator,
): string {
  if (kind === '5h')
    return translator.t('provider.zai.window.5h');
  if (kind === '7d')
    return translator.t('provider.zai.window.7d');
  return translator.t('provider.zai.window.other', {
    name: limit.type.replaceAll('_', ' ').toLowerCase(),
  });
}

function formatPlan(level: string): string {
  return level
    .toLowerCase()
    .split(/[_-]+/)
    .map(part => part ? `${part[0].toUpperCase()}${part.slice(1)}` : '')
    .join(' ');
}
