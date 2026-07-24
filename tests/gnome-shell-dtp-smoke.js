import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const DASH_TO_PANEL_UUID = 'dash-to-panel@jderose9.github.com';
const QUOTA_GLANCE_UUID = 'quota-glance@geequlim';

export const METRICS = {
    dashToPanelMounts: {
        description: 'Successful standalone Dash to Panel mounts',
        units: 'mounts',
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

async function waitUntil(predicate, timeoutMilliseconds = 5000) {
    const deadline = GLib.get_monotonic_time() + timeoutMilliseconds * 1000;

    while (!predicate()) {
        if (GLib.get_monotonic_time() >= deadline)
            return false;
        await delay(100);
    }

    return true;
}

export async function run() {
    await waitUntil(() => Boolean(global.dashToPanel?.panels));

    if (!Main.extensionManager.disableExtension(DASH_TO_PANEL_UUID))
        throw new Error('Unable to disable Dash to Panel for reconfiguration');

    await waitUntil(() => !global.dashToPanel);

    const settings = new Gio.Settings({
        schema_id: 'org.gnome.shell.extensions.dash-to-panel',
    });
    settings.set_boolean('stockgs-keep-top-panel', true);

    if (!Main.extensionManager.enableExtension(DASH_TO_PANEL_UUID))
        throw new Error('Unable to enable standalone Dash to Panel');

    const panelsReady = await waitUntil(() =>
        Boolean(global.dashToPanel?.panels?.length));
    if (!panelsReady)
        throw new Error('Dash to Panel did not create its standalone panel');

    const quotaSettings = Main.extensionManager
        .lookup(QUOTA_GLANCE_UUID)?.stateObj?.getSettings();
    if (!quotaSettings)
        throw new Error('Unable to load Quota Glance settings');
    const availabilityReported = await waitUntil(() =>
        quotaSettings.get_boolean('dash-to-panel-available'));
    if (!availabilityReported)
        throw new Error('Quota Glance did not report the bottom panel');
    if (quotaSettings.get_string('panel-target') !== 'main')
        throw new Error('Quota Glance does not default to the GNOME panel');
    if (!Main.panel.statusArea[QUOTA_GLANCE_UUID])
        throw new Error('Quota Glance did not start in the GNOME panel');

    const dashPanelEntry = global.dashToPanel.panels.find(
        entry => entry.geom.position === St.Side.BOTTOM && entry.isPrimary,
    ) ?? global.dashToPanel.panels.find(
        entry => entry.geom.position === St.Side.BOTTOM,
    );
    if (!dashPanelEntry)
        throw new Error('Dash to Panel did not create a bottom panel');
    if (!dashPanelEntry?.isStandalone)
        throw new Error('Dash to Panel primary panel is not standalone');

    quotaSettings.set_string('panel-target', 'dash-to-panel');
    const quotaMounted = await waitUntil(() =>
        Boolean(dashPanelEntry.panel.statusArea[QUOTA_GLANCE_UUID]));
    if (!quotaMounted)
        throw new Error('Quota Glance did not move to Dash to Panel');

    if (Main.panel.statusArea[QUOTA_GLANCE_UUID])
        throw new Error('Quota Glance remained in the GNOME top panel');

    const indicator = dashPanelEntry.panel.statusArea[QUOTA_GLANCE_UUID];
    if (indicator.container.get_parent() !== dashPanelEntry.panel._centerBox)
        throw new Error('Quota Glance did not mount in the Dash to Panel center box');

    if (
        indicator.menu._boxPointer._userArrowSide !==
        dashPanelEntry.geom.position
    ) {
        throw new Error('Quota Glance popup does not follow the panel side');
    }

    indicator.menu.open();
    const popupOpened = await waitUntil(() =>
        indicator.menu.isOpen && indicator.menu.actor.mapped);
    if (!popupOpened)
        throw new Error('Quota Glance popup did not become visible');

    const popupBounds = indicator.menu.actor.get_transformed_extents();
    const indicatorBounds = indicator.get_transformed_extents();
    const popupCenterX = popupBounds.origin.x + popupBounds.size.width / 2;
    const indicatorCenterX =
        indicatorBounds.origin.x + indicatorBounds.size.width / 2;
    if (Math.abs(popupCenterX - indicatorCenterX) > 4) {
        throw new Error(
            `Popup is not centered on the indicator: ` +
            `${popupCenterX} vs ${indicatorCenterX}`,
        );
    }
    const monitor = dashPanelEntry.monitor;
    if (
        popupBounds.origin.x < monitor.x ||
        popupBounds.origin.y < monitor.y ||
        popupBounds.origin.x + popupBounds.size.width >
            monitor.x + monitor.width ||
        popupBounds.origin.y + popupBounds.size.height >
            monitor.y + monitor.height
    ) {
        throw new Error('Quota Glance popup opened outside the target monitor');
    }
    indicator.menu.close();

    quotaSettings.set_string('panel-target', 'main');
    const returnedToMain = await waitUntil(() =>
        Boolean(Main.panel.statusArea[QUOTA_GLANCE_UUID]));
    if (!returnedToMain)
        throw new Error('Quota Glance did not return to the GNOME panel');

    METRICS.dashToPanelMounts.value = 1;
}
