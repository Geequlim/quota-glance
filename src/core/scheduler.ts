import GLib from 'gi://GLib';

const MIN_INTERVAL_MINUTES = 1;
const MAX_INTERVAL_MINUTES = 240;

export class RefreshScheduler {
  readonly #refresh: () => void;
  #initialSourceId = 0;
  #intervalMinutes: number;
  #periodicSourceId = 0;

  constructor(refresh: () => void, intervalMinutes: number) {
    this.#refresh = refresh;
    this.#intervalMinutes = sanitizeInterval(intervalMinutes);
  }

  start(): void {
    this.dispose();

    this.#initialSourceId = GLib.timeout_add_seconds(
      GLib.PRIORITY_DEFAULT,
      1,
      () => {
        this.#initialSourceId = 0;
        this.#refresh();
        return GLib.SOURCE_REMOVE;
      },
    );
    this.#startPeriodicSource();
  }

  setInterval(intervalMinutes: number): void {
    const nextInterval = sanitizeInterval(intervalMinutes);
    if (nextInterval === this.#intervalMinutes)
      return;

    this.#intervalMinutes = nextInterval;
    this.#removePeriodicSource();
    this.#startPeriodicSource();
  }

  dispose(): void {
    if (this.#initialSourceId !== 0) {
      GLib.source_remove(this.#initialSourceId);
      this.#initialSourceId = 0;
    }
    this.#removePeriodicSource();
  }

  #startPeriodicSource(): void {
    this.#periodicSourceId = GLib.timeout_add_seconds(
      GLib.PRIORITY_DEFAULT,
      this.#intervalMinutes * 60,
      () => {
        this.#refresh();
        return GLib.SOURCE_CONTINUE;
      },
    );
  }

  #removePeriodicSource(): void {
    if (this.#periodicSourceId === 0)
      return;

    GLib.source_remove(this.#periodicSourceId);
    this.#periodicSourceId = 0;
  }
}

export function sanitizeInterval(value: number): number {
  if (!Number.isFinite(value))
    return 5;

  return Math.max(
    MIN_INTERVAL_MINUTES,
    Math.min(MAX_INTERVAL_MINUTES, Math.trunc(value)),
  );
}

