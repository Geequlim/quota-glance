import type Gio from 'gi://Gio';

import type {
  PanelItem,
  ProviderState,
  ProviderViewModel,
} from './types.js';

export interface UsageProvider<TData = unknown> {
  readonly id: string;
  readonly name: string;
  readonly order: number;
  readonly enabledByDefault: boolean;

  collect(cancellable: Gio.Cancellable): Promise<TData>;
  getPanelItems(state: ProviderState<TData>): PanelItem[];
  getPopupViewModel(state: ProviderState<TData>): ProviderViewModel;
  dispose(): void;
}

export function effectiveData<TData>(
  state: ProviderState<TData>,
): TData | null {
  return state.data ?? state.lastSuccessfulData;
}

export function isStale<TData>(state: ProviderState<TData>): boolean {
  return state.data === null && state.lastSuccessfulData !== null;
}

