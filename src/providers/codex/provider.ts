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
import {CommandRunner} from '../../runtime/command-runner.js';
import {ProviderRuntimeError} from '../../runtime/errors.js';
import type {Translator} from '../../shared/i18n/index.js';
import {
  CodexAppServerClient,
  CodexRpcError,
} from './app-server-client.js';
import {
  parseCodexErrorFallback,
  parseCodexResponses,
  remainingCodexPercent,
  type CodexData,
  type CodexWindow,
} from './parser.js';

export class CodexProvider implements UsageProvider<CodexData> {
  readonly id = 'codex';
  readonly name = 'Codex';
  readonly order = 10;
  readonly enabledByDefault = true;
  readonly #runner: CommandRunner;
  readonly #client: CodexAppServerClient;
  readonly #translator: Translator;

  constructor(runner: CommandRunner, translator: Translator) {
    this.#runner = runner;
    this.#client = new CodexAppServerClient(runner);
    this.#translator = translator;
  }

  async collect(cancellable: Gio.Cancellable): Promise<CodexData> {
    const executable = this.#runner.findExecutable('codex');
    if (!executable) {
      throw new ProviderRuntimeError(
        'executable-not-found',
        this.#translator.t('error.codex.missingCli'),
        {localized: true, retryable: false},
      );
    }

    let account: unknown = {};
    try {
      const results = await this.#client.collect(executable, cancellable);
      account = results.account;
      return parseCodexResponses(results.account, results.rateLimits);
    } catch (caught) {
      if (caught instanceof CodexRpcError) {
        const fallback = parseCodexErrorFallback(
          caught.payload,
          caught.accountResponse ?? account,
        );
        if (fallback)
          return fallback;
        const notAuthenticated = /auth|login|sign in/i.test(caught.message);
        throw new ProviderRuntimeError(
          notAuthenticated ? 'not-authenticated' : 'process-exited',
          caught.message,
          {cause: caught, retryable: !notAuthenticated},
        );
      }
      throw caught;
    }
  }

  getPanelItems(state: ProviderState<CodexData>): PanelItem[] {
    const data = effectiveData(state);
    const window = data?.secondary ?? data?.primary ?? null;
    const remaining = remainingCodexPercent(window);
    return [{
      text: remaining === null ? '--' : `${Math.round(remaining)}%`,
      priority: 10,
    }];
  }

  getPopupViewModel(
    state: ProviderState<CodexData>,
  ): ProviderViewModel {
    const data = effectiveData(state);
    return {
      title: 'Codex',
      subtitle: data
        ? data.email || this.#translator.t('provider.codex.account')
        : undefined,
      badge: data
        ? data.plan
          ? formatPlan(data.plan)
          : this.#translator.t('provider.common.unknownPlan')
        : undefined,
      metrics: data ? createMetrics(data, this.#translator) : [],
      details: data?.credits?.balance
        ? [this.#translator.t('provider.codex.credits', {
          value: data.credits.balance,
        })]
        : [],
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
  data: CodexData,
  translator: Translator,
): MetricViewModel[] {
  return [
    windowMetric(
      data.primary,
      'primary',
      'provider.codex.window.5h',
      translator,
    ),
    windowMetric(
      data.secondary,
      'secondary',
      'provider.codex.window.7d',
      translator,
    ),
  ].filter((metric): metric is MetricViewModel => metric !== null);
}

function windowMetric(
  window: CodexWindow | null,
  id: string,
  fallbackKey: 'provider.codex.window.5h' | 'provider.codex.window.7d',
  translator: Translator,
): MetricViewModel | null {
  if (!window)
    return null;
  const remaining = remainingCodexPercent(window);
  return {
    id,
    label: formatWindowLabel(window.durationMinutes, fallbackKey, translator),
    value: remaining === null ? '--' : `${Math.round(remaining)}%`,
    progress: remaining === null ? undefined : remaining / 100,
    resetAt: window.resetAt ?? undefined,
  };
}

function formatWindowLabel(
  durationMinutes: number | null,
  fallbackKey: 'provider.codex.window.5h' | 'provider.codex.window.7d',
  translator: Translator,
): string {
  if (durationMinutes === 300)
    return translator.t('provider.codex.window.5h');
  if (durationMinutes === 10_080)
    return translator.t('provider.codex.window.7d');
  if (durationMinutes && durationMinutes % 1440 === 0)
    return translator.t('provider.codex.window.days', {
      count: durationMinutes / 1440,
    });
  if (durationMinutes && durationMinutes % 60 === 0)
    return translator.t('provider.codex.window.hours', {
      count: durationMinutes / 60,
    });
  return translator.t(fallbackKey);
}

function formatPlan(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, char =>
    char.toUpperCase());
}
