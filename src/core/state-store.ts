import type {
  ProviderError,
  ProviderState,
} from './types.js';

export type StateListener = () => void;

export class StateStore {
  readonly #states = new Map<string, ProviderState>();
  readonly #listeners = new Set<StateListener>();

  initializeProvider(providerId: string, enabled: boolean): void {
    if (this.#states.has(providerId))
      throw new Error(`Provider ${providerId} is already initialized`);

    this.#states.set(providerId, {
      id: providerId,
      enabled,
      phase: 'idle',
      data: null,
      lastSuccessfulData: null,
      error: null,
      updatedAt: null,
    });
    this.#emit();
  }

  subscribe(listener: StateListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  get<TData = unknown>(providerId: string): ProviderState<TData> | null {
    return (this.#states.get(providerId) as ProviderState<TData> | undefined) ??
      null;
  }

  list(): ProviderState[] {
    return [...this.#states.values()];
  }

  setEnabled(providerId: string, enabled: boolean): void {
    this.#update(providerId, state => ({
      ...state,
      enabled,
    }));
  }

  markLoading(providerId: string): void {
    this.#update(providerId, state => ({
      ...state,
      phase: 'loading',
      data: null,
      error: null,
    }));
  }

  markReady<TData>(
    providerId: string,
    data: TData,
    updatedAt = Date.now(),
  ): void {
    this.#update(providerId, state => ({
      ...state,
      phase: 'ready',
      data,
      lastSuccessfulData: data,
      error: null,
      updatedAt,
    }));
  }

  markError(providerId: string, error: ProviderError): void {
    this.#update(providerId, state => ({
      ...state,
      phase: 'error',
      data: null,
      error,
    }));
  }

  #update(
    providerId: string,
    updater: (state: ProviderState) => ProviderState,
  ): void {
    const state = this.#states.get(providerId);
    if (!state)
      throw new Error(`Unknown provider ${providerId}`);

    this.#states.set(providerId, updater(state));
    this.#emit();
  }

  #emit(): void {
    for (const listener of this.#listeners)
      listener();
  }
}

