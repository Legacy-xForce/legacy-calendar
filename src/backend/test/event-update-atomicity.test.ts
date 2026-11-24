import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createUser, http, startTestApp, TEST_ADDRESS, type TestApp, type TestUser } from './helpers.js';

type EventJson = {
    id: number;
    features: Array<{ id: number }>;
};

describe('event update atomicity', () => {
    let app: TestApp;
    let host: TestUser;
    let eventId: number;

    beforeAll(async () => {
        app = await startTestApp();
        host = await createUser(app, 'atomicityhost');
        const created = await http<EventJson>(app, 'POST', '/events', {
            bearer: host.token,
            body: {
                title: 'Atomic event',
                startTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                features: [{ featureId: 1, price: null, mandatory: false, oneTime: false }],
                ...TEST_ADDRESS
            }
        });
        if (created.status !== 201) {
            throw new Error(`Could not create event: ${JSON.stringify(created.body)}`);
        }
        eventId = created.body.id;
    }, 120_000);

    afterAll(async () => {
        await app.close();
    });

    test('a failed feature/participant update leaves the original features intact', async () => {
        const failed = await http(app, 'PATCH', `/events/${eventId}`, {
            bearer: host.token,
            body: {
                features: [{ featureId: 2, price: null, mandatory: false, oneTime: false }],
                participants: [999_999]
            }
        });
        expect(failed.status).toBeGreaterThanOrEqual(400);

        const after = await http<EventJson>(app, 'GET', `/events/${eventId}`, { bearer: host.token });
        expect(after.status).toBe(200);
        expect(after.body.features.map((feature) => feature.id)).toEqual([1]);
    });
});
