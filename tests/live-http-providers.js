import Gio from 'gi://Gio';

import {createProviders} from '../.build-js/providers/index.js';
import {EnvironmentLoader} from '../.build-js/runtime/environment-loader.js';
import {normalizeProviderError} from '../.build-js/runtime/errors.js';
import {HttpClient} from '../.build-js/runtime/http-client.js';
import {createTranslator} from '../.build-js/shared/i18n/index.js';

const environment = new EnvironmentLoader().load();
const http = new HttpClient(environment);
const providers = createProviders(http, environment, createTranslator())
    .filter(provider => ['zai', 'deepseek', 'opencode-go'].includes(provider.id));

let failed = false;
try {
    await Promise.all(providers.map(async provider => {
        try {
            await provider.collect(new Gio.Cancellable());
            print(`${provider.id}: success`);
        } catch (caught) {
            failed = true;
            const error = normalizeProviderError(caught);
            printerr(`${provider.id}: ${error.code}: ${error.message}`);
        }
    }));
} finally {
    for (const provider of providers)
        provider.dispose();
    http.dispose();
}

if (failed)
    throw new Error('One or more live HTTP providers failed');
