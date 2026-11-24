import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createUser, http, startTestApp, TEST_ADDRESS, type TestApp, type TestUser } from './helpers.js';

describe('server-side ride capacity', () => {
    let app: TestApp;
    let host: TestUser;
    let driver: TestUser;
    let passengerOne: TestUser;
    let passengerTwo: TestUser;
    let eventId: number;

    beforeAll(async () => {
        app = await startTestApp();
        host = await createUser(app, 'capacityhost');
        driver = await createUser(app, 'capacitydriver');
        passengerOne = await createUser(app, 'capacitypassenger1');
        passengerTwo = await createUser(app, 'capacitypassenger2');

        const created = await http<{ id: number }>(app, 'POST', '/events', {
            bearer: host.token,
            body: {
                title: 'Carpool',
                startTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                participants: [driver.id, passengerOne.id, passengerTwo.id],
                ...TEST_ADDRESS
            }
        });
        if (created.status !== 201) {
            throw new Error(`Could not create event: ${JSON.stringify(created.body)}`);
        }
        eventId = created.body.id;

        const joins = await Promise.all([
            http(app, 'POST', `/events/${eventId}/join`, {
                bearer: driver.token,
                body: { transportMode: 'DRIVER', vehicleSeats: 2 }
            }),
            http(app, 'POST', `/events/${eventId}/join`, {
                bearer: passengerOne.token,
                body: { transportMode: 'NEEDS_RIDE' }
            }),
            http(app, 'POST', `/events/${eventId}/join`, {
                bearer: passengerTwo.token,
                body: { transportMode: 'NEEDS_RIDE' }
            })
        ]);
        if (joins.some((result) => result.status >= 400)) {
            throw new Error(`Could not accept invitations: ${JSON.stringify(joins.map((r) => r.status))}`);
        }
    }, 120_000);

    afterAll(async () => {
        await app.close();
    });

    test('does not assign more passengers than the driver has seats', async () => {
        const first = await http(app, 'PATCH', `/events/${eventId}/rides`, {
            bearer: host.token,
            body: { passengerIds: [passengerOne.id], driverId: driver.id, direction: 'OUTBOUND' }
        });
        expect(first.status).toBe(200);

        const second = await http(app, 'PATCH', `/events/${eventId}/rides`, {
            bearer: host.token,
            body: { passengerIds: [passengerTwo.id], driverId: driver.id, direction: 'OUTBOUND' }
        });
        expect(second.status).toBe(400);
    }, 60_000);
});
