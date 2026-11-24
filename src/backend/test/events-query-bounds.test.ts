import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createUser, http, startTestApp, type TestApp, type TestUser } from './helpers.js';

describe('calendar query bounds', () => {
    let app: TestApp;
    let user: TestUser;

    beforeAll(async () => {
        app = await startTestApp();
        user = await createUser(app, 'queryboundsuser');
    }, 120_000);

    afterAll(async () => {
        await app.close();
    });

    test('rejects an unbounded date range', async () => {
        const response = await http(app, 'GET', '/events?start=1900-01-01T00:00:00.000Z&end=2100-01-01T00:00:00.000Z', {
            bearer: user.token
        });
        expect(response.status).toBe(400);
    });

    test('still accepts a normal month range', async () => {
        const response = await http(app, 'GET', '/events?start=2026-04-01T00:00:00.000Z&end=2026-05-01T00:00:00.000Z', {
            bearer: user.token
        });
        expect(response.status).toBe(200);
    });

    test('rejects an end before the start', async () => {
        const response = await http(app, 'GET', '/events?start=2026-05-01T00:00:00.000Z&end=2026-04-01T00:00:00.000Z', {
            bearer: user.token
        });
        expect(response.status).toBe(400);
    });
});
