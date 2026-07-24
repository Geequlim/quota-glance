import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Soup from 'gi://Soup?version=3.0';

import {HttpClient} from '../.build-js/runtime/http-client.js';

const server = new Soup.Server();

server.add_handler('/json', (_server, message) => {
    message.set_status(Soup.Status.OK, null);
    message.set_response(
        'application/json',
        Soup.MemoryUse.COPY,
        JSON.stringify({ok: true}),
    );
});

server.add_handler('/unauthorized', (_server, message) => {
    message.set_status(Soup.Status.UNAUTHORIZED, null);
    message.set_response(
        'application/json',
        Soup.MemoryUse.COPY,
        JSON.stringify({
            authorization: 'Bearer fixture-secret-token',
            cookie: 'auth=fixture-secret-token',
        }),
    );
});

server.add_handler('/invalid-json', (_server, message) => {
    message.set_status(Soup.Status.OK, null);
    message.set_response(
        'application/json',
        Soup.MemoryUse.COPY,
        '{not-json',
    );
});

server.add_handler('/large', (_server, message) => {
    message.set_status(Soup.Status.OK, null);
    message.set_response(
        'text/plain',
        Soup.MemoryUse.COPY,
        'x'.repeat(1024),
    );
});

server.add_handler('/slow', (_server, message) => {
    message.pause();
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 250, () => {
        message.set_status(Soup.Status.OK, null);
        message.set_response('text/plain', Soup.MemoryUse.COPY, 'late');
        message.unpause();
        return GLib.SOURCE_REMOVE;
    });
});

server.listen_local(0, Soup.ServerListenOptions.IPV4_ONLY);
const baseUrl = server.get_uris()[0].to_string().replace(/\/$/, '');
const client = new HttpClient();

try {
    const json = await client.requestJson(
        {
            method: 'GET',
            url: `${baseUrl}/json`,
        },
        new Gio.Cancellable(),
    );
    assert(json.ok === true, 'JSON request did not return fixture data');

    await assertRejects(
        client.request(
            {
                method: 'GET',
                url: `${baseUrl}/unauthorized`,
                headers: {
                    Authorization: 'Bearer fixture-secret-token',
                    Cookie: 'auth=fixture-secret-token',
                },
            },
            new Gio.Cancellable(),
        ),
        error => error.code === 'not-authenticated' &&
            !error.message.includes('fixture-secret-token'),
        'HTTP authentication error was not classified or sanitized',
    );

    await assertRejects(
        client.requestJson(
            {
                method: 'GET',
                url: `${baseUrl}/invalid-json`,
            },
            new Gio.Cancellable(),
        ),
        error => error.code === 'invalid-response',
        'Invalid JSON was not classified',
    );

    await assertRejects(
        client.request(
            {
                method: 'GET',
                url: `${baseUrl}/large`,
                maxResponseBytes: 64,
            },
            new Gio.Cancellable(),
        ),
        error => error.code === 'invalid-response',
        'Response size limit was not enforced',
    );

    await assertRejects(
        client.request(
            {
                method: 'GET',
                url: `${baseUrl}/slow`,
                timeoutMs: 30,
            },
            new Gio.Cancellable(),
        ),
        error => error.code === 'timeout',
        'HTTP timeout was not classified',
    );

    const cancellable = new Gio.Cancellable();
    GLib.timeout_add(GLib.PRIORITY_DEFAULT, 30, () => {
        cancellable.cancel();
        return GLib.SOURCE_REMOVE;
    });
    await assertRejects(
        client.request(
            {
                method: 'GET',
                url: `${baseUrl}/slow`,
                timeoutMs: 1000,
            },
            cancellable,
        ),
        error => error.code === 'cancelled',
        'HTTP cancellation was not classified',
    );

    print('HTTP runtime smoke test passed');
} finally {
    client.dispose();
    server.disconnect();
}

function assert(condition, message) {
    if (!condition)
        throw new Error(message);
}

async function assertRejects(promise, predicate, message) {
    try {
        await promise;
    } catch (error) {
        if (predicate(error))
            return;
        throw new Error(`${message}: ${error}`);
    }
    throw new Error(`${message}: request unexpectedly succeeded`);
}
