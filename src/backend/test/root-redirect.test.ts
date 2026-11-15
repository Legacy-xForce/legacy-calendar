import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { startTestApp, type TestApp } from './helpers.js';

describe('GET /', () => {
    let app: TestApp;

    beforeAll(async () => {
        process.env.WEB_APP_URL = 'https://calendar.test.invalid';
        app = await startTestApp();
    }, 120_000);

    afterAll(async () => {
        await app.close();
        delete process.env.WEB_APP_URL;
    });

    test('sends a browser to the web app', async () => {
        const response = await fetch(new URL('/', app.baseUrl), { redirect: 'manual' });

        expect(response.status).toBe(302);
        expect(response.headers.get('location')).toBe('https://calendar.test.invalid');
    });
});
