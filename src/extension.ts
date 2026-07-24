import Gio from 'gi://Gio';
import St from 'gi://St';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {RefreshController} from './core/controller.js';
import type {UsageProvider} from './core/provider.js';
import {RefreshScheduler} from './core/scheduler.js';
import {StateStore} from './core/state-store.js';
import {
  PanelIndicator,
  type PanelIndicatorInstance,
} from './host/panel-indicator.js';
import {
  resolvePanel,
  type DashToPanelEntry,
  type PanelTarget,
} from './host/panel-target.js';
import {createProviders} from './providers/index.js';
import {EnvironmentLoader} from './runtime/environment-loader.js';
import {HttpClient} from './runtime/http-client.js';
import {
  createTranslator,
  type Translator,
} from './shared/i18n/index.js';

const DASH_TO_PANEL_UUID = 'dash-to-panel@jderose9.github.com';
const SETTINGS_DASH_TO_PANEL_AVAILABLE = 'dash-to-panel-available';
const SETTINGS_ENABLED_PROVIDERS = 'enabled-providers';
const SETTINGS_PANEL_TARGET = 'panel-target';
const SETTINGS_REFRESH_INTERVAL = 'refresh-interval-minutes';

type PanelHost = typeof Main.panel;

interface DashToPanelEmitter {
  panels?: DashToPanelEntry<PanelHost>[];
  connect(signal: 'panels-created', callback: () => void): number;
  disconnect(signalId: number): void;
}

const shellGlobal = global as typeof global & {
  dashToPanel?: DashToPanelEmitter;
};

export default class QuotaGlanceExtension extends Extension {
  #controller: RefreshController | null = null;
  #controllerUnsubscribe: (() => void) | null = null;
  #dashToPanel: DashToPanelEmitter | null = null;
  #dashToPanelSignalId = 0;
  #extensionManagerSignalId = 0;
  #http: HttpClient | null = null;
  #indicator: PanelIndicatorInstance | null = null;
  #indicatorHost: PanelHost | null = null;
  #providers: UsageProvider[] = [];
  #scheduler: RefreshScheduler | null = null;
  #settings: Gio.Settings | null = null;
  #settingsSignalIds: number[] = [];
  #store: StateStore | null = null;
  #storeUnsubscribe: (() => void) | null = null;
  readonly #translator: Translator = createTranslator();

  enable(): void {
    this.#settings = this.getSettings();
    const environment = new EnvironmentLoader().load();
    this.#http = new HttpClient(environment);
    this.#providers = createProviders(
      this.#http,
      environment,
      this.#translator,
    );
    this.#store = new StateStore();

    const enabledProviderIds = new Set(
      this.#settings.get_strv(SETTINGS_ENABLED_PROVIDERS),
    );
    for (const provider of this.#providers) {
      this.#store.initializeProvider(
        provider.id,
        enabledProviderIds.has(provider.id),
      );
    }

    this.#controller = new RefreshController(this.#providers, this.#store);

    this.#storeUnsubscribe = this.#store.subscribe(() => this.#render());
    this.#controllerUnsubscribe = this.#controller.subscribe(
      () => this.#render(),
    );

    this.#settingsSignalIds.push(
      this.#settings.connect(
        `changed::${SETTINGS_REFRESH_INTERVAL}`,
        () => {
          const interval = this.#getRefreshInterval();
          this.#scheduler?.setInterval(interval);
          this.#render();
        },
      ),
      this.#settings.connect(
        `changed::${SETTINGS_ENABLED_PROVIDERS}`,
        () => this.#syncEnabledProviders(),
      ),
      this.#settings.connect(
        `changed::${SETTINGS_PANEL_TARGET}`,
        () => this.#mountIndicator(),
      ),
    );

    this.#extensionManagerSignalId = Main.extensionManager.connect(
      'extension-state-changed',
      (_manager, extension) => {
        if (extension.uuid !== DASH_TO_PANEL_UUID)
          return;

        this.#connectDashToPanel();
        this.#mountIndicator();
      },
    );
    this.#connectDashToPanel();
    this.#mountIndicator();

    this.#scheduler = new RefreshScheduler(
      () => {
        void this.#controller?.refreshAll();
      },
      this.#getRefreshInterval(),
    );

    this.#render();
    this.#scheduler.start();
  }

  disable(): void {
    this.#settings?.set_boolean(SETTINGS_DASH_TO_PANEL_AVAILABLE, false);
    this.#disconnectDashToPanel();
    if (this.#extensionManagerSignalId !== 0) {
      Main.extensionManager.disconnect(this.#extensionManagerSignalId);
      this.#extensionManagerSignalId = 0;
    }

    this.#scheduler?.dispose();
    this.#scheduler = null;

    this.#controller?.dispose();
    this.#controller = null;

    this.#storeUnsubscribe?.();
    this.#storeUnsubscribe = null;
    this.#controllerUnsubscribe?.();
    this.#controllerUnsubscribe = null;

    if (this.#settings) {
      for (const signalId of this.#settingsSignalIds)
        this.#settings.disconnect(signalId);
    }
    this.#settingsSignalIds = [];

    for (const provider of this.#providers)
      provider.dispose();
    this.#providers = [];

    this.#http?.dispose();
    this.#http = null;

    this.#indicator?.destroy();
    this.#indicator = null;
    this.#indicatorHost = null;
    this.#store = null;
    this.#settings = null;
  }

  #connectDashToPanel(): void {
    this.#disconnectDashToPanel();

    const dashToPanel = shellGlobal.dashToPanel;
    if (!dashToPanel)
      return;

    this.#dashToPanel = dashToPanel;
    this.#dashToPanelSignalId = dashToPanel.connect(
      'panels-created',
      () => {
        this.#updateDashToPanelAvailability();
        this.#mountIndicator();
      },
    );
    this.#updateDashToPanelAvailability();
  }

  #disconnectDashToPanel(): void {
    if (this.#dashToPanel && this.#dashToPanelSignalId !== 0)
      this.#dashToPanel.disconnect(this.#dashToPanelSignalId);

    this.#dashToPanel = null;
    this.#dashToPanelSignalId = 0;
    this.#updateDashToPanelAvailability();
  }

  #updateDashToPanelAvailability(): void {
    const available = this.#dashToPanel?.panels?.some(entry =>
      Boolean(entry.panel) && entry.geom?.position === St.Side.BOTTOM) ?? false;
    if (
      this.#settings &&
      this.#settings.get_boolean(SETTINGS_DASH_TO_PANEL_AVAILABLE) !== available
    ) {
      this.#settings.set_boolean(
        SETTINGS_DASH_TO_PANEL_AVAILABLE,
        available,
      );
    }
  }

  #getRefreshInterval(): number {
    return this.#settings?.get_int(SETTINGS_REFRESH_INTERVAL) ?? 5;
  }

  #getPanelTarget(): PanelTarget {
    return this.#settings?.get_string(SETTINGS_PANEL_TARGET) === 'main'
      ? 'main'
      : 'dash-to-panel';
  }

  #mountIndicator(): void {
    if (!this.#settings)
      return;

    const resolved = resolvePanel(
      Main.panel,
      shellGlobal.dashToPanel,
      this.#getPanelTarget(),
      St.Side.BOTTOM,
    );
    if (this.#indicator && this.#indicatorHost === resolved.panel)
      return;

    this.#indicator?.destroy();
    const indicator = new PanelIndicator();
    this.#indicator = indicator;
    this.#indicatorHost = resolved.panel;
    indicator.connect('destroy', () => {
      if (this.#indicator === indicator) {
        this.#indicator = null;
        this.#indicatorHost = null;
      }
    });
    indicator.setAssetRoot(this.path);
    indicator.setTranslator(this.#translator);
    indicator.setCallbacks(
      () => {
        void this.#controller?.refreshAll();
      },
      () => {
        this.openPreferences();
      },
    );
    if (
      resolved.target === 'dash-to-panel' &&
      resolved.entry?.geom?.position !== undefined
    ) {
      indicator.setPopupSide(resolved.entry.geom.position);
    }

    resolved.panel.addToStatusArea(
      this.uuid,
      indicator,
      0,
      resolved.target === 'dash-to-panel' ? 'center' : 'right',
    );
    this.#render();
  }

  #render(): void {
    if (!this.#indicator || !this.#store || !this.#controller)
      return;

    this.#indicator.render({
      providers: this.#providers,
      store: this.#store,
      refreshing: this.#controller.isRefreshing,
    });
  }

  #syncEnabledProviders(): void {
    if (!this.#settings || !this.#controller)
      return;

    const enabledProviderIds = new Set(
      this.#settings.get_strv(SETTINGS_ENABLED_PROVIDERS),
    );
    for (const provider of this.#providers) {
      this.#controller.setProviderEnabled(
        provider.id,
        enabledProviderIds.has(provider.id),
      );
    }
    this.#render();
  }
}
