import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';

import {
  ExtensionPreferences,
} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {PROVIDER_CATALOG} from './shared/provider-catalog.js';
import {
  createTranslator,
  type Translator,
} from './shared/i18n/index.js';

const SETTINGS_ENABLED_PROVIDERS = 'enabled-providers';
const SETTINGS_DASH_TO_PANEL_AVAILABLE = 'dash-to-panel-available';
const SETTINGS_PANEL_TARGET = 'panel-target';
const SETTINGS_REFRESH_INTERVAL = 'refresh-interval-minutes';

export default class QuotaGlancePreferences extends ExtensionPreferences {
  override async fillPreferencesWindow(
    window: Adw.PreferencesWindow,
  ): Promise<void> {
    const settings = this.getSettings();
    const translator = createTranslator();
    const page = new Adw.PreferencesPage({
      title: translator.t('app.name'),
      iconName: 'view-dashboard-symbolic',
    });

    page.add(this.#createProviderGroup(settings, translator));
    page.add(this.#createPanelGroup(settings, translator));
    page.add(this.#createRefreshGroup(settings, translator));
    window.add(page);
  }

  #createProviderGroup(
    settings: Gio.Settings,
    translator: Translator,
  ): Adw.PreferencesGroup {
    const group = new Adw.PreferencesGroup({
      title: translator.t('prefs.providers.title'),
      description: translator.t('prefs.providers.description'),
    });
    const rows = new Map<string, Adw.SwitchRow>();
    let syncing = false;

    const syncRows = () => {
      syncing = true;
      const enabledProviderIds = new Set(
        settings.get_strv(SETTINGS_ENABLED_PROVIDERS),
      );
      for (const [providerId, row] of rows)
        row.active = enabledProviderIds.has(providerId);
      syncing = false;
    };

    for (const provider of PROVIDER_CATALOG) {
      const row = new Adw.SwitchRow({
        title: provider.name,
        subtitle: translator.t(provider.descriptionKey),
      });
      row.add_prefix(new Gtk.Image({
        gicon: new Gio.FileIcon({
          file: Gio.File.new_for_path(
            `${this.path}/icons/${provider.id}-symbolic.svg`,
          ),
        }),
        pixelSize: 20,
      }));
      rows.set(provider.id, row);
      row.connect('notify::active', () => {
        if (syncing)
          return;

        const enabledProviderIds = new Set(
          settings.get_strv(SETTINGS_ENABLED_PROVIDERS),
        );
        if (row.active)
          enabledProviderIds.add(provider.id);
        else
          enabledProviderIds.delete(provider.id);
        settings.set_strv(
          SETTINGS_ENABLED_PROVIDERS,
          [...enabledProviderIds],
        );
      });
      group.add(row);
    }

    syncRows();
    settings.connect(
      `changed::${SETTINGS_ENABLED_PROVIDERS}`,
      syncRows,
    );
    return group;
  }

  #createPanelGroup(
    settings: Gio.Settings,
    translator: Translator,
  ): Adw.PreferencesGroup {
    const group = new Adw.PreferencesGroup();
    const choices = new Gtk.StringList();
    choices.append(translator.t('prefs.panel.top'));
    choices.append(translator.t('prefs.panel.bottom'));
    const row = new Adw.ComboRow({
      title: translator.t('prefs.panel.title'),
      subtitle: translator.t('prefs.panel.subtitle'),
      model: choices,
      selected: settings.get_string(SETTINGS_PANEL_TARGET) === 'dash-to-panel'
        ? 1
        : 0,
    });
    let syncing = false;

    row.connect('notify::selected', () => {
      if (!syncing) {
        settings.set_string(
          SETTINGS_PANEL_TARGET,
          row.selected === 1 ? 'dash-to-panel' : 'main',
        );
      }
    });
    settings.connect(`changed::${SETTINGS_PANEL_TARGET}`, () => {
      syncing = true;
      row.selected =
        settings.get_string(SETTINGS_PANEL_TARGET) === 'dash-to-panel' ? 1 : 0;
      syncing = false;
    });
    settings.bind(
      SETTINGS_DASH_TO_PANEL_AVAILABLE,
      group,
      'visible',
      Gio.SettingsBindFlags.GET,
    );
    group.add(row);
    return group;
  }

  #createRefreshGroup(
    settings: Gio.Settings,
    translator: Translator,
  ): Adw.PreferencesGroup {
    const group = new Adw.PreferencesGroup({
      title: translator.t('prefs.refresh.title'),
    });
    const row = new Adw.SpinRow({
      title: translator.t('prefs.refresh.interval.title'),
      subtitle: translator.t('prefs.refresh.interval.subtitle'),
      adjustment: new Gtk.Adjustment({
        lower: 1,
        upper: 240,
        stepIncrement: 1,
        pageIncrement: 5,
        value: settings.get_int(SETTINGS_REFRESH_INTERVAL),
      }),
      digits: 0,
      numeric: true,
      snapToTicks: true,
    });
    let syncing = false;

    row.connect('notify::value', () => {
      if (!syncing) {
        settings.set_int(
          SETTINGS_REFRESH_INTERVAL,
          Math.round(row.value),
        );
      }
    });
    settings.connect(`changed::${SETTINGS_REFRESH_INTERVAL}`, () => {
      syncing = true;
      row.value = settings.get_int(SETTINGS_REFRESH_INTERVAL);
      syncing = false;
    });
    group.add(row);
    return group;
  }
}
