import Gio from 'gi://Gio';

import {createProviders} from '../.build-js/providers/index.js';
import {EnvironmentLoader} from '../.build-js/runtime/environment-loader.js';
import {normalizeProviderError} from '../.build-js/runtime/errors.js';
import {HttpClient} from '../.build-js/runtime/http-client.js';
import {createTranslator} from '../.build-js/shared/i18n/index.js';

const environment = new EnvironmentLoader().load();
const http = new HttpClient(environment);
const providers = createProviders(http, environment, createTranslator())
    .filter(provider => ['codex', 'copilot'].includes(provider.id));

try {
    for (const provider of providers) {
        try {
            const data = await provider.collect(new Gio.Cancellable());
            print(`${provider.id}: success: ${JSON.stringify(data)}`);
        } catch (caught) {
            const error = normalizeProviderError(caught);
            print(`${provider.id}: ${error.code}: ${error.message}`);
            if (error.debugMessage)
                print(`${provider.id} debug: ${error.debugMessage}`);
        }
    }
} finally {
    for (const provider of providers)
        provider.dispose();
    http.dispose();
}
