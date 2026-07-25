import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

import type {UsageProvider} from '../core/provider.js';
import type {StateStore} from '../core/state-store.js';
import type {
  ProviderError,
  ProviderViewModel,
} from '../core/types.js';
import {
  formatResetAt,
  formatUpdatedAt,
} from '../shared/formatters.js';
import {
  createTranslatorForLanguage,
  type MessageKey,
  type Translator,
} from '../shared/i18n/index.js';
import {remainingLevel} from '../shared/quota-style.js';

export interface IndicatorRenderState {
  providers: UsageProvider[];
  store: StateStore;
  refreshing: boolean;
}

export const PanelIndicator = GObject.registerClass(
class PanelIndicator extends PanelMenu.Button {
  declare private _assetRoot: string;
  declare private _displayedProviderIds: string[];
  declare private _onOpenPreferences: () => void;
  declare private _onRefresh: () => void;
  declare private _panelBox: St.BoxLayout;
  declare private _panelText: string;
  declare private _refreshButton: St.Button | null;
  declare private _settingsButton: St.Button | null;
  declare private _translator: Translator;

  override _init(): void {
    super._init(0.5, 'Quota Glance');

    this._assetRoot = '';
    this._displayedProviderIds = [];
    this._onOpenPreferences = () => {};
    this._onRefresh = () => {};
    this._panelText = '--';
    this._refreshButton = null;
    this._settingsButton = null;
    this._translator = createTranslatorForLanguage('en');

    this._panelBox = new St.BoxLayout({
      styleClass: 'quota-glance-panel-box',
      yAlign: Clutter.ActorAlign.CENTER,
    });
    this._panelBox.add_child(new St.Icon({
      iconName: 'view-dashboard-symbolic',
      styleClass: 'system-status-icon',
    }));
    this._panelBox.add_child(new St.Label({
      text: '--',
      yAlign: Clutter.ActorAlign.CENTER,
    }));
    this.add_child(this._panelBox);
    this.set_accessible_name(this._translator.t('app.name'));
  }

  setAssetRoot(assetRoot: string): void {
    this._assetRoot = assetRoot;
  }

  setTranslator(translator: Translator): void {
    this._translator = translator;
    this.set_accessible_name(translator.t('app.name'));
  }

  getDisplayedProviderIds(): readonly string[] {
    return this._displayedProviderIds;
  }

  getPanelText(): string {
    return this._panelText;
  }

  setCallbacks(
    onRefresh: () => void,
    onOpenPreferences: () => void,
  ): void {
    this._onRefresh = onRefresh;
    this._onOpenPreferences = onOpenPreferences;
  }

  setPopupSide(side: number): void {
    const menu = this.menu as PopupMenu.PopupMenu;
    menu._boxPointer._userArrowSide = side as St.Side;
    menu._boxPointer.updateArrowSide(side as St.Side);
  }

  render(renderState: IndicatorRenderState): void {
    const enabledProviders = renderState.providers.filter(provider =>
      renderState.store.get(provider.id)?.enabled);

    this._renderPanel(enabledProviders, renderState.store);

    this._rebuildMenu(renderState, enabledProviders);
  }

  private _renderPanel(
    enabledProviders: UsageProvider[],
    store: StateStore,
  ): void {
    this._panelBox.destroy_all_children();
    this._displayedProviderIds = [];
    const panelText: string[] = [];

    if (enabledProviders.length === 0) {
      this._panelText = '--';
      this._panelBox.add_child(new St.Icon({
        iconName: 'view-dashboard-symbolic',
        styleClass: 'system-status-icon',
      }));
      this._panelBox.add_child(new St.Label({text: '--'}));
      return;
    }

    for (const provider of enabledProviders) {
      const state = store.get(provider.id);
      if (!state)
        continue;

      const group = new St.BoxLayout({
        styleClass: 'quota-glance-panel-provider',
        yAlign: Clutter.ActorAlign.CENTER,
      });
      const icon = this._createProviderIcon(
        provider.id,
        'quota-glance-panel-icon system-status-icon',
      );
      if (state.phase === 'error')
        icon.add_style_class_name('prompt-dialog-error-label');
      group.add_child(icon);

      const text = provider.getPanelItems(state)
        .sort((left, right) => left.priority - right.priority)
        .map(item => item.text)
        .join(' · ') || '--';
      this._displayedProviderIds.push(provider.id);
      panelText.push(text);
      group.add_child(new St.Label({
        text,
        styleClass: 'quota-glance-panel-value',
        yAlign: Clutter.ActorAlign.CENTER,
      }));
      this._panelBox.add_child(group);
    }
    this._panelText = panelText.join(' · ');
  }

  private _rebuildMenu(
    renderState: IndicatorRenderState,
    enabledProviders: UsageProvider[],
  ): void {
    const menu = this.menu as PopupMenu.PopupMenu;
    menu.removeAll();

    const headerItem = new PopupMenu.PopupBaseMenuItem({
      reactive: false,
      can_focus: false,
    });
    headerItem.add_style_class_name('quota-glance-static-item');

    const errorCount = enabledProviders.filter(provider =>
      renderState.store.get(provider.id)?.phase === 'error').length;
    const latestUpdate = Math.max(
      ...enabledProviders
        .map(provider => renderState.store.get(provider.id)?.updatedAt ?? 0),
      0,
    );
    const statusText = renderState.refreshing
      ? this._translator.t('status.syncing')
      : errorCount > 0
        ? this._translator.t(
            errorCount === 1 ? 'status.error.one' : 'status.error.many',
            {count: errorCount},
          )
        : enabledProviders.length === 0
          ? this._translator.t('status.empty')
          : formatUpdatedAt(latestUpdate || null, this._translator);
    const header = new St.BoxLayout({
      xExpand: true,
      styleClass: 'quota-glance-menu-header',
    });
    header.add_child(new St.Label({
      text: this._translator.t('app.name'),
      xExpand: true,
      styleClass: 'quota-glance-menu-title',
      yAlign: Clutter.ActorAlign.CENTER,
    }));
    const status = new St.Label({
      text: statusText,
      styleClass: errorCount > 0
        ? 'quota-glance-menu-status prompt-dialog-error-label'
        : 'quota-glance-menu-status popup-inactive-menu-item',
      yAlign: Clutter.ActorAlign.CENTER,
    });
    header.add_child(status);
    headerItem.add_child(header);
    menu.addMenuItem(headerItem);
    menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

    enabledProviders.forEach(provider => {
      const state = renderState.store.get(provider.id);
      if (!state)
        return;
      const providerItem = new PopupMenu.PopupBaseMenuItem({
        reactive: false,
        can_focus: false,
      });
      providerItem.add_style_class_name('quota-glance-static-item');
      providerItem.add_style_class_name('quota-glance-provider-item');
      providerItem.add_child(this._createProviderSection(
        provider.id,
        provider.getPopupViewModel(state),
      ));
      menu.addMenuItem(providerItem);
    });

    if (enabledProviders.length === 0) {
      const emptyItem = new PopupMenu.PopupBaseMenuItem({
        reactive: false,
        can_focus: false,
      });
      emptyItem.add_style_class_name('quota-glance-static-item');
      const empty = new St.BoxLayout({
        xExpand: true,
        styleClass: 'quota-glance-empty popup-inactive-menu-item',
      });
      empty.add_child(new St.Icon({
        iconName: 'preferences-system-symbolic',
        styleClass: 'popup-menu-icon',
      }));
      empty.add_child(new St.Label({
        text: this._translator.t('popup.chooseProviders'),
        yAlign: Clutter.ActorAlign.CENTER,
      }));
      emptyItem.add_child(empty);
      menu.addMenuItem(emptyItem);
    }

    menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
    const actionsItem = new PopupMenu.PopupBaseMenuItem({
      reactive: false,
      can_focus: false,
    });
    actionsItem.add_style_class_name('quota-glance-static-item');
    const actions = new St.BoxLayout({
      xExpand: true,
      styleClass: 'quota-glance-actions',
    });
    this._refreshButton = this._createActionButton(
      renderState.refreshing
        ? this._translator.t('status.syncing')
        : this._translator.t('action.refresh'),
      renderState.refreshing
        ? 'content-loading-symbolic'
        : 'view-refresh-symbolic',
      () => this._onRefresh(),
    );
    this._refreshButton.set_reactive(!renderState.refreshing);
    this._refreshButton.set_can_focus(!renderState.refreshing);
    actions.add_child(this._refreshButton);

    this._settingsButton = this._createActionButton(
      this._translator.t('action.settings'),
      'preferences-system-symbolic',
      () => {
        menu.close();
        this._onOpenPreferences();
      },
    );
    actions.add_child(this._settingsButton);
    actionsItem.add_child(actions);
    menu.addMenuItem(actionsItem);
  }

  private _createProviderSection(
    providerId: string,
    viewModel: ProviderViewModel,
  ): St.BoxLayout {
    const section = new St.BoxLayout({
      vertical: true,
      xExpand: true,
      styleClass: 'quota-glance-provider-section',
    });

    const header = new St.BoxLayout({
      xExpand: true,
      styleClass: 'quota-glance-provider-header',
    });
    header.add_child(this._createProviderIcon(
      providerId,
      'quota-glance-provider-icon popup-menu-icon',
    ));
    header.add_child(new St.Label({
      text: viewModel.title,
      xExpand: true,
      styleClass: 'quota-glance-provider-title',
      yAlign: Clutter.ActorAlign.CENTER,
    }));
    if (viewModel.badge) {
      const badge = new St.Label({
        text: viewModel.badge,
        styleClass:
          'quota-glance-provider-badge popup-inactive-menu-item',
        yAlign: Clutter.ActorAlign.CENTER,
      });
      badge.add_style_pseudo_class('insensitive');
      header.add_child(badge);
    }
    if (viewModel.phase === 'error') {
      header.add_child(new St.Icon({
        iconName: 'dialog-warning-symbolic',
        styleClass:
          'quota-glance-icon-error prompt-dialog-error-label',
      }));
    }
    section.add_child(header);

    if (viewModel.subtitle) {
      section.add_child(this._createDetailLabel(viewModel.subtitle));
    }

    if (viewModel.phase === 'loading' && viewModel.metrics.length === 0)
      section.add_child(this._createDetailLabel(
        `${this._translator.t('status.syncing')}…`,
      ));

    for (const metric of viewModel.metrics) {
      const metricBox = new St.BoxLayout({
        vertical: true,
        xExpand: true,
        styleClass: 'quota-glance-metric',
      });
      const row = new St.BoxLayout({
        xExpand: true,
        styleClass: 'quota-glance-metric-header',
      });
      row.add_child(new St.Label({
        text: metric.label,
        xExpand: true,
        styleClass: 'quota-glance-metric-label',
      }));
      row.add_child(new St.Label({
        text: metric.value,
        styleClass: metric.progress === undefined
          ? 'quota-glance-metric-value'
          : 'quota-glance-metric-value quota-glance-metric-percentage',
      }));
      metricBox.add_child(row);

      if (metric.progress !== undefined) {
        metricBox.add_child(this._createProgressBar(metric.progress));
      }

      if (metric.detail || metric.resetAt) {
        const meta = new St.BoxLayout({
          xExpand: true,
          styleClass:
            'quota-glance-metric-meta popup-inactive-menu-item',
        });
        if (metric.resetAt) {
          meta.add_child(new St.Label({
            text: formatResetAt(metric.resetAt, this._translator),
            xExpand: true,
            styleClass: 'quota-glance-metric-reset',
          }));
        }
        if (metric.detail) {
          meta.add_child(new St.Label({
            text: metric.detail,
            styleClass: 'quota-glance-metric-detail',
          }));
        }
        metricBox.add_child(meta);
      }
      section.add_child(metricBox);
    }

    if (viewModel.error) {
      const error = new St.BoxLayout({
        styleClass: 'quota-glance-error-row prompt-dialog-error-label',
      });
      error.add_child(new St.Icon({
        iconName: 'dialog-warning-symbolic',
      }));
      error.add_child(new St.Label({
        text: localizedErrorMessage(viewModel.error, this._translator),
        xExpand: true,
      }));
      section.add_child(error);
    }

    if (viewModel.footer) {
      const footer = new St.BoxLayout({
        styleClass:
          'quota-glance-stale-row popup-inactive-menu-item',
      });
      footer.add_child(new St.Icon({iconName: 'document-open-recent-symbolic'}));
      footer.add_child(new St.Label({
        text: this._translator.t('popup.lastGoodData'),
      }));
      section.add_child(footer);
    }

    return section;
  }

  private _createDetailLabel(text: string): St.Label {
    const label = new St.Label({
      text,
      xExpand: true,
      styleClass:
        'quota-glance-popup-detail popup-inactive-menu-item',
    });
    label.clutterText.lineWrap = true;
    label.add_style_pseudo_class('insensitive');
    return label;
  }

  private _createProviderIcon(
    providerId: string,
    styleClass: string,
  ): St.Icon {
    const iconPath = `${this._assetRoot}/icons/${providerId}-symbolic.svg`;
    return new St.Icon({
      gicon: new Gio.FileIcon({file: Gio.File.new_for_path(iconPath)}),
      styleClass,
    });
  }

  private _createProgressBar(
    progress: number,
  ): St.DrawingArea {
    const fraction = Math.max(0, Math.min(1, progress));
    const bar = new St.DrawingArea({
      xExpand: true,
      height: 7,
      styleClass: `quota-glance-progress quota-glance-progress-${
        remainingLevel(fraction)
      }`,
    });
    bar.connect('repaint', area => {
      const cr = area.get_context();
      const [width, height] = area.get_surface_size();
      const radius = height / 2;
      const themeNode = area.get_theme_node();
      const [, foreground] = themeNode.lookup_color('color', true);
      const trackColor = foreground;
      const fillColor = foreground;

      cr.newSubPath();
      cr.arc(width - radius, radius, radius, -Math.PI / 2, Math.PI / 2);
      cr.arc(radius, radius, radius, Math.PI / 2, 1.5 * Math.PI);
      cr.closePath();
      cr.setSourceRGBA(
        trackColor.get_red(),
        trackColor.get_green(),
        trackColor.get_blue(),
        0.14,
      );
      cr.fill();

      const fillWidth = Math.max(
        fraction > 0 ? height : 0,
        Math.round(width * fraction),
      );
      if (fillWidth > 0) {
        const fillRadius = Math.min(radius, fillWidth / 2);
        cr.newSubPath();
        cr.arc(
          fillWidth - fillRadius,
          fillRadius,
          fillRadius,
          -Math.PI / 2,
          Math.PI / 2,
        );
        cr.arc(
          fillRadius,
          fillRadius,
          fillRadius,
          Math.PI / 2,
          1.5 * Math.PI,
        );
        cr.closePath();
        cr.setSourceRGBA(
          fillColor.get_red(),
          fillColor.get_green(),
          fillColor.get_blue(),
          0.95,
        );
        cr.fill();
      }

      cr.$dispose();
    });
    return bar;
  }

  private _createActionButton(
    label: string,
    iconName: string,
    callback: () => void,
  ): St.Button {
    const content = new St.BoxLayout({
      xAlign: Clutter.ActorAlign.CENTER,
      xExpand: true,
      styleClass: 'quota-glance-action-content',
    });
    content.add_child(new St.Icon({
      iconName,
      styleClass: 'popup-menu-icon',
    }));
    content.add_child(new St.Label({
      text: label,
      yAlign: Clutter.ActorAlign.CENTER,
    }));
    const button = new St.Button({
      child: content,
      xExpand: true,
      canFocus: true,
      styleClass: 'button quota-glance-action-button',
    });
    button.set_accessible_name(label);
    button.connect('clicked', callback);
    return button;
  }
});

export type PanelIndicatorInstance = InstanceType<typeof PanelIndicator>;

function localizedErrorMessage(
  error: ProviderError,
  translator: Translator,
): string {
  if (error.localized)
    return error.message;

  const keys: Record<ProviderError['code'], MessageKey> = {
    'missing-config': 'error.missingConfig',
    'executable-not-found': 'error.executableNotFound',
    'not-authenticated': 'error.notAuthenticated',
    cancelled: 'error.cancelled',
    timeout: 'error.timeout',
    http: 'error.http',
    'invalid-response': 'error.invalidResponse',
    'process-exited': 'error.processExited',
    internal: 'error.internal',
  };
  return translator.t(keys[error.code]);
}
