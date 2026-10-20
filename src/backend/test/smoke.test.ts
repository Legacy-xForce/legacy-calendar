import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createApiToken, createUser, http, startTestApp, type TestApp } from './helpers.js';

describe('test harness', () => {
    let app: TestApp;

    beforeAll(async () => {
        app = await startTestApp();
    }, 120_000);

    afterAll(async () => {
        await app.close();
    });

    test('provisions a user, mints an API token and authenticates with it', async () => {
        const user = await createUser(app, 'smoke');
        const token = await createApiToken(app, user, 'read', 'Smoke');

        expect(token.token).toMatch(/^legacy-calendar-[0-9a-f-]{36}$/);

        const response = await http(app, 'GET', '/users', { apiToken: token.token });
        expect(response.status).toBe(200);
        expect(Array.isArray(response.body)).toBe(true);
    });
});
