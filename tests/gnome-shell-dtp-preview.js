import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {
    syncPreviewActivationEnvironment,
} from './gnome-shell-preview-environment.js';

const DASH_TO_PANEL_UUID = 'dash-to-panel@jderose9.github.com';
const QUOTA_GLANCE_UUID = 'quota-glance@geequlim';

export const METRICS = {};

function delay(milliseconds) {
    return new Promise(resolve => {
        GLib.timeout_add_once(
            GLib.PRIORITY_DEFAULT,
            milliseconds,
            resolve,
        );
    });
}

async function waitForIndicator(timeoutMilliseconds = 5000) {
    const deadline = GLib.get_monotonic_time() + timeoutMilliseconds * 1000;

    while (GLib.get_monotonic_time() < deadline) {
        const panels = global.dashToPanel?.panels ?? [];
        const panelEntry = panels.find(entry => entry.isPrimary) ?? panels[0];
        const indicator = panelEntry?.panel.statusArea[QUOTA_GLANCE_UUID];
        if (indicator)
            return indicator;
        await delay(100);
    }

    throw new Error('Quota Glance did not appear in Dash to Panel');
}

export async function run() {
    syncPreviewActivationEnvironment();

    if (global.dashToPanel) {
        if (!Main.extensionManager.disableExtension(DASH_TO_PANEL_UUID))
            throw new Error('Unable to restart Dash to Panel for the preview');
        await waitUntil(() => !global.dashToPanel);
    }

    const dashToPanelSettings = new Gio.Settings({
        schema_id: 'org.gnome.shell.extensions.dash-to-panel',
    });
    dashToPanelSettings.set_boolean('stockgs-keep-top-panel', true);

    if (!Main.extensionManager.enableExtension(DASH_TO_PANEL_UUID))
        throw new Error('Unable to start Dash to Panel for the preview');

    const quotaGlanceReady = await waitUntil(() =>
        Boolean(Main.extensionManager.lookup(QUOTA_GLANCE_UUID)?.stateObj));
    if (!quotaGlanceReady)
        throw new Error('Quota Glance did not finish loading');
    const quotaGlanceSettings = Main.extensionManager
        .lookup(QUOTA_GLANCE_UUID)?.stateObj?.getSettings();
    if (!quotaGlanceSettings)
        throw new Error('Unable to load Quota Glance settings');
    const bottomPanelReady = await waitUntil(() =>
        quotaGlanceSettings.get_boolean('dash-to-panel-available'));
    if (!bottomPanelReady)
        throw new Error('Quota Glance did not detect the bottom panel');
    quotaGlanceSettings.set_string('panel-target', 'dash-to-panel');
    const indicator = await waitForIndicator();
    quotaGlanceSettings.set_strv(
        'enabled-providers',
        ['codex', 'copilot', 'zai', 'deepseek', 'opencode-go'],
    );
    indicator.menu.open();

    print('Quota Glance Dash to Panel preview is ready. Close the window to stop.');

    await new Promise(() => {});
}

async function waitUntil(predicate, timeoutMilliseconds = 5000) {
    const deadline = GLib.get_monotonic_time() + timeoutMilliseconds * 1000;

    while (!predicate()) {
        if (GLib.get_monotonic_time() >= deadline)
            return false;
        await delay(100);
    }

    return true;
}
