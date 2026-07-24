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
  buildOpenCodeCookie,
  minimumLongTermRemaining,
  parseOpenCodePage,
  type OpenCodeData,
  type OpenCodeWindow,
  type OpenCodeWindowKind,
} from './parser.js';

export class OpenCodeGoProvider implements UsageProvider<OpenCodeData> {
  readonly id = 'opencode-go';
  readonly name = 'OpenCode Go';
  readonly order = 40;
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

  async collect(cancellable: Gio.Cancellable): Promise<OpenCodeData> {
    const workspaceId =
      this.#dependencies.environment.OPENCODE_GO_WORKSPACE_ID;
    const authCookie =
      this.#dependencies.environment.OPENCODE_GO_AUTH_COOKIE;
    if (!workspaceId) {
      throw new ProviderRuntimeError(
        'missing-config',
        this.#translator.t('error.opencode.missingWorkspace'),
        {localized: true, retryable: false},
      );
    }
    if (!authCookie) {
      throw new ProviderRuntimeError(
        'missing-config',
        this.#translator.t('error.opencode.missingCookie'),
        {localized: true, retryable: false},
      );
    }

    const html = await this.#dependencies.http.requestText({
      method: 'GET',
      url: `https://opencode.ai/workspace/${
        encodeURIComponent(workspaceId)
      }/go`,
      headers: {
        Accept: 'text/html',
        Cookie: buildOpenCodeCookie(authCookie),
        'User-Agent': 'Mozilla/5.0 Quota-Glance/0.1',
      },
      maxResponseBytes: 2 * 1024 * 1024,
    }, cancellable);
    return parseOpenCodePage(html);
  }

  getPanelItems(state: ProviderState<OpenCodeData>): PanelItem[] {
    const data = effectiveData(state);
    const remaining = data ? minimumLongTermRemaining(data) : null;
    return [{
      text: remaining === null ? '--' : `${Math.round(remaining)}%`,
      priority: 50,
    }];
  }

  getPopupViewModel(
    state: ProviderState<OpenCodeData>,
  ): ProviderViewModel {
    const data = effectiveData(state);
    return {
      title: 'OpenCode Go',
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
  data: OpenCodeData,
  translator: Translator,
): MetricViewModel[] {
  return (Object.entries(data) as [
    OpenCodeWindowKind,
    OpenCodeWindow | null,
  ][])
    .filter((entry): entry is [OpenCodeWindowKind, OpenCodeWindow] =>
      entry[1] !== null)
    .map(([kind, window]) => ({
      id: kind,
      label: translator.t(`provider.opencode.metric.${kind}`),
      value: `${Math.round(window.percentRemaining)}%`,
      progress: Math.max(0, Math.min(1, window.percentRemaining / 100)),
      resetAt: window.resetAt,
    }));
}
