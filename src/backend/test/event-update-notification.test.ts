import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createUser, http, startTestApp, TEST_ADDRESS, type TestApp, type TestUser } from './helpers.js';
import { EventsService } from '../src/events/events.service.js';
import { describeEventFieldChange } from '../src/events/event-notification.constants.js';

interface Notifier {
    notifyParticipants(id: number, notification: { type: string; body: string }, status?: unknown): Promise<void>;
}

describe('event updated notification details', () => {
    let app: TestApp;
    let host: TestUser;
    let eventId: number;
    const bodies: string[] = [];

    beforeAll(async () => {
        app = await startTestApp();
        host = await createUser(app, 'notifhost');
        const resolved: unknown = app.app.get(EventsService);
        const service = resolved as Notifier;
        const original: Notifier['notifyParticipants'] = service.notifyParticipants.bind(
            service
        ) as Notifier['notifyParticipants'];
        service.notifyParticipants = (id, notification, status) => {
            if (notification.type === 'EVENT_UPDATED') bodies.push(notification.body);
            return original(id, notification, status);
        };
        const created = await http<{ id: number }>(app, 'POST', '/events', {
            bearer: host.token,
            body: {
                title: 'Dinner',
                startTime: new Date(Date.now() + 24 * 3_600_000).toISOString(),
                ...TEST_ADDRESS
            }
        });
        eventId = created.body.id;
    }, 120_000);

    afterAll(async () => {
        await app.close();
    });

    test('lists what changed in the body', async () => {
        const res = await http(app, 'PATCH', `/events/${eventId}`, {
            bearer: host.token,
            body: { title: 'Big Dinner', description: 'bring wine' }
        });
        expect(res.status).toBe(200);
        expect(bodies.at(-1)).toBe(
            'Event "Big Dinner" has been updated: title is now "Big Dinner"; description changed.'
        );
    });

    test('stays silent when nothing changed', async () => {
        const before = bodies.length;
        await http(app, 'PATCH', `/events/${eventId}`, { bearer: host.token, body: { title: 'Big Dinner' } });
        expect(bodies.length).toBe(before);
    });

    test('formats field changes', () => {
        expect(describeEventFieldChange('startTime', '2026-12-01T18:30:00.000Z')).toBe(
            'starts at 2026-12-01 18:30 UTC'
        );
        expect(describeEventFieldChange('endTime', null)).toBe('end time removed');
        expect(describeEventFieldChange('hostId', 1)).toBeNull();
    });
});
