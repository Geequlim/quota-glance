import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

const UUID = 'quota-glance@geequlim';

export const METRICS = {
    lifecycleCycles: {
        description: 'Successful Quota Glance enable/disable cycles',
        units: 'cycles',
        value: 0,
    },
};

function delay(milliseconds) {
    return new Promise(resolve => {
        GLib.timeout_add_once(
            GLib.PRIORITY_DEFAULT,
            milliseconds,
            resolve,
        );
    });
}

function getIndicator() {
    return Main.panel.statusArea[UUID] ?? null;
}

async function waitForIndicator(present, timeoutMilliseconds = 5000) {
    const deadline = GLib.get_monotonic_time() + timeoutMilliseconds * 1000;

    while (Boolean(getIndicator()) !== present) {
        if (GLib.get_monotonic_time() >= deadline)
            return false;
        await delay(100);
    }

    return true;
}

function assertIndicatorVisible() {
    const indicator = getIndicator();
    if (!indicator) {
        const extension = Main.extensionManager.lookup(UUID);
        const state = extension?.state ?? 'not-registered';
        const error = extension?.error ?? 'no extension error';
        throw new Error(
            `Quota Glance indicator missing; extension state=${state}; error=${error}`,
        );
    }

    if (!indicator.visible)
        throw new Error('Quota Glance indicator is not visible');

    return indicator;
}

export async function run() {
    await waitForIndicator(true);

    const indicator = assertIndicatorVisible();
    const settings = Main.extensionManager.lookup(UUID)?.stateObj?.getSettings();
    if (!settings)
        throw new Error('Unable to load Quota Glance settings');
    indicator.menu.open();
    await delay(100);
    if (!indicator.menu.isOpen)
        throw new Error('Quota Glance popup did not open');
    const menuItems = indicator.menu._getMenuItems();
    if (menuItems.some(item => item instanceof PopupMenu.PopupSwitchMenuItem))
        throw new Error('Provider switches remained in the panel popup');
    const separators = menuItems.filter(item =>
        item instanceof PopupMenu.PopupSeparatorMenuItem);
    if (separators.length !== 2) {
        throw new Error(
            `Expected only header/action separators, got ${separators.length}`,
        );
    }
    if (!indicator._settingsButton)
        throw new Error('Quota Glance popup has no settings entry');
    if (!indicator._refreshButton)
        throw new Error('Quota Glance popup has no refresh entry');
    if (indicator._refreshButton.get_parent() !==
        indicator._settingsButton.get_parent()) {
        throw new Error('Refresh and Settings are not in the same row');
    }
    const simplifiedChinese = GLib.get_language_names().some(languageName =>
        /^zh_(?:CN|SG)(?:[.@]|$)/i.test(languageName) ||
        /^zh-Hans(?:[.@_-]|$)/i.test(languageName),
    );
    const expectedLanguage = simplifiedChinese ? 'zh-CN' : 'en';
    const expectedSettingsLabel = simplifiedChinese ? '设置' : 'Settings';
    if (indicator._translator.language !== expectedLanguage) {
        throw new Error(
            `Expected ${expectedLanguage}, got ${indicator._translator.language}`,
        );
    }
    const settingsLabel = indicator._settingsButton.get_accessible_name();
    if (settingsLabel !== expectedSettingsLabel) {
        throw new Error(
            `Unexpected localized Settings label: ${settingsLabel}`,
        );
    }
    indicator.menu.close();

    const extension = Main.extensionManager.lookup(UUID);
    if (!extension?.hasPrefs)
        throw new Error('GNOME Shell did not recognize Quota Glance preferences');
    if (!Main.extensionManager.openExtensionPrefs(UUID, '', {}))
        throw new Error('Unable to open Quota Glance preferences');
    await delay(500);

    await delay(1600);
    const firstPanelText = indicator.getPanelText();
    if (!indicator.getDisplayedProviderIds().includes('codex')) {
        throw new Error(`Unexpected panel text after refresh: ${firstPanelText}`);
    }

    settings.set_strv(
        'enabled-providers',
        ['codex', 'zai', 'deepseek', 'opencode-go'],
    );
    await delay(200);
    const enabledPanelText = indicator.getPanelText();
    const displayedProviderIds = indicator.getDisplayedProviderIds();
    if (!displayedProviderIds.includes('zai') ||
        !displayedProviderIds.includes('deepseek') ||
        !displayedProviderIds.includes('opencode-go')) {
        throw new Error(
            `HTTP providers could not be enabled independently: ${enabledPanelText}`,
        );
    }

    indicator._onRefresh();
    await delay(700);
    const refreshedPanelText = indicator.getPanelText();
    if (!refreshedPanelText) {
        throw new Error(
            `Partial provider failures cleared the panel: ${enabledPanelText}`,
        );
    }

    settings.set_strv(
        'enabled-providers',
        ['codex', 'deepseek', 'opencode-go'],
    );
    await delay(100);
    if (indicator.getDisplayedProviderIds().includes('zai'))
        throw new Error('Z.ai remained visible after being disabled');

    for (let cycle = 1; cycle <= 5; cycle++) {
        if (!Main.extensionManager.disableExtension(UUID))
            throw new Error(`Failed to request disable during cycle ${cycle}`);

        if (!await waitForIndicator(false))
            throw new Error(`Indicator remained after disable cycle ${cycle}`);

        if (!Main.extensionManager.enableExtension(UUID))
            throw new Error(`Failed to request enable during cycle ${cycle}`);

        await waitForIndicator(true);
        assertIndicatorVisible();
        METRICS.lifecycleCycles.value = cycle;
    }
}
