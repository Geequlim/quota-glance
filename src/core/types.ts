export type ProviderPhase = 'idle' | 'loading' | 'ready' | 'error';

export type ProviderErrorCode =
  | 'missing-config'
  | 'executable-not-found'
  | 'not-authenticated'
  | 'cancelled'
  | 'timeout'
  | 'http'
  | 'invalid-response'
  | 'process-exited'
  | 'internal';

export interface ProviderError {
  code: ProviderErrorCode;
  message: string;
  debugMessage?: string;
  localized?: boolean;
  retryable: boolean;
}

export interface ProviderState<TData = unknown> {
  id: string;
  enabled: boolean;
  phase: ProviderPhase;
  data: TData | null;
  lastSuccessfulData: TData | null;
  error: ProviderError | null;
  updatedAt: number | null;
}

export interface PanelItem {
  text: string;
  priority: number;
}

export interface MetricViewModel {
  id: string;
  label: string;
  value: string;
  progress?: number;
  detail?: string;
  resetAt?: number;
}

export interface ProviderViewModel {
  title: string;
  subtitle?: string;
  badge?: string;
  metrics: MetricViewModel[];
  details: string[];
  footer?: string;
  phase: ProviderPhase;
  stale: boolean;
  error?: ProviderError;
}

export interface RefreshResult {
  providerId: string;
  ok: boolean;
  error?: ProviderError;
}

export interface RefreshSummary {
  started: boolean;
  results: RefreshResult[];
}
