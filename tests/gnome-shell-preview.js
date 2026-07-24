import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {
    syncPreviewActivationEnvironment,
} from './gnome-shell-preview-environment.js';

const UUID = 'quota-glance@geequlim';

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

    while (!Main.panel.statusArea[UUID]) {
        if (GLib.get_monotonic_time() >= deadline)
            throw new Error('Quota Glance did not appear in the nested panel');
        await delay(100);
    }

    return Main.panel.statusArea[UUID];
}

export async function run() {
    syncPreviewActivationEnvironment();

    const indicator = await waitForIndicator();
    const settings = Main.extensionManager.lookup(UUID)?.stateObj?.getSettings();
    if (!settings)
        throw new Error('Unable to load Quota Glance settings');
    settings.set_strv(
        'enabled-providers',
        ['codex', 'copilot', 'zai', 'deepseek', 'opencode-go'],
    );
    indicator.menu.open();

    print('Quota Glance preview is ready. Close the nested GNOME window to stop.');

    await new Promise(() => {});
}
