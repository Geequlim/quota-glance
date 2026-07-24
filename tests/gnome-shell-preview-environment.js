import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const ACTIVATION_ENVIRONMENT_KEYS = [
    'GSETTINGS_BACKEND',
    'XDG_CACHE_HOME',
    'XDG_CONFIG_HOME',
    'XDG_DATA_HOME',
];

export function syncPreviewActivationEnvironment() {
    const environment = {};

    for (const key of ACTIVATION_ENVIRONMENT_KEYS) {
        const value = GLib.getenv(key);
        if (value !== null)
            environment[key] = value;
    }

    Gio.DBus.session.call_sync(
        'org.freedesktop.DBus',
        '/org/freedesktop/DBus',
        'org.freedesktop.DBus',
        'UpdateActivationEnvironment',
        new GLib.Variant('(a{ss})', [environment]),
        null,
        Gio.DBusCallFlags.NONE,
        -1,
        null,
    );
}
