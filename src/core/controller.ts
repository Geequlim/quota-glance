import Gio from 'gi://Gio';

import type {UsageProvider} from './provider.js';
import {StateStore} from './state-store.js';
import type {
  RefreshResult,
  RefreshSummary,
} from './types.js';
import {normalizeProviderError} from '../runtime/errors.js';

type ControllerListener = () => void;

export class RefreshController {
  readonly #providers: UsageProvider[];
  readonly #store: StateStore;
  readonly #listeners = new Set<ControllerListener>();
  #cancellable: Gio.Cancellable | null = null;
  #disposed = false;
  #generation = 0;
  #refreshing = false;

  constructor(providers: UsageProvider[], store: StateStore) {
    this.#providers = providers;
    this.#store = store;
  }

  get isRefreshing(): boolean {
    return this.#refreshing;
  }

  subscribe(listener: ControllerListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  async refreshAll(): Promise<RefreshSummary> {
    if (this.#disposed || this.#refreshing)
      return {started: false, results: []};

    const providers = this.#providers.filter(provider =>
      this.#store.get(provider.id)?.enabled);
    if (providers.length === 0)
      return {started: false, results: []};

    return this.#refreshProviders(providers);
  }

  async refreshProvider(providerId: string): Promise<RefreshSummary> {
    if (this.#disposed || this.#refreshing)
      return {started: false, results: []};

    const provider = this.#providers.find(candidate =>
      candidate.id === providerId);
    if (!provider || !this.#store.get(providerId)?.enabled)
      return {started: false, results: []};

    return this.#refreshProviders([provider]);
  }

  setProviderEnabled(providerId: string, enabled: boolean): void {
    const state = this.#store.get(providerId);
    if (!state || state.enabled === enabled)
      return;

    this.#store.setEnabled(providerId, enabled);
    if (enabled)
      void this.refreshProvider(providerId);
  }

  cancelCurrentRefresh(): void {
    this.#generation++;
    this.#cancellable?.cancel();
    this.#cancellable = null;
    this.#refreshing = false;
    this.#emit();
  }

  dispose(): void {
    if (this.#disposed)
      return;

    this.#disposed = true;
    this.cancelCurrentRefresh();
    this.#listeners.clear();
  }

  async #refreshProviders(
    providers: UsageProvider[],
  ): Promise<RefreshSummary> {
    this.#refreshing = true;
    this.#emit();

    const generation = ++this.#generation;
    const cancellable = new Gio.Cancellable();
    this.#cancellable = cancellable;

    for (const provider of providers)
      this.#store.markLoading(provider.id);

    const results = await Promise.all(
      providers.map(provider =>
        this.#collectProvider(provider, cancellable, generation)),
    );

    if (this.#generation === generation) {
      this.#cancellable = null;
      this.#refreshing = false;
      this.#emit();
    }

    return {started: true, results};
  }

  async #collectProvider(
    provider: UsageProvider,
    cancellable: Gio.Cancellable,
    generation: number,
  ): Promise<RefreshResult> {
    try {
      const data = await provider.collect(cancellable);
      if (this.#canApply(provider.id, cancellable, generation))
        this.#store.markReady(provider.id, data);
      return {providerId: provider.id, ok: true};
    } catch (caught) {
      const error = normalizeProviderError(caught);
      if (this.#canApply(provider.id, cancellable, generation))
        this.#store.markError(provider.id, error);
      return {providerId: provider.id, ok: false, error};
    }
  }

  #canApply(
    providerId: string,
    cancellable: Gio.Cancellable,
    generation: number,
  ): boolean {
    return !this.#disposed &&
      !cancellable.is_cancelled() &&
      generation === this.#generation &&
      Boolean(this.#store.get(providerId)?.enabled);
  }

  #emit(): void {
    for (const listener of this.#listeners)
      listener();
  }
}
