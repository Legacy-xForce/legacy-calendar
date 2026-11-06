import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createUser, http, startTestApp, TEST_ADDRESS, type TestApp, type TestUser } from './helpers.js';

type EventJson = { id: number; participants: Array<{ id: number }> };

const inHours = (hours: number) => new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

describe('editing an event that has magic-link guests', () => {
    let app: TestApp;
    let host: TestUser;
    let member: TestUser;

    beforeAll(async () => {
        app = await startTestApp();
        host = await createUser(app, 'host');
        member = await createUser(app, 'member');
    }, 120_000);

    afterAll(async () => {
        await app.close();
    });

    test('PATCH echoing a guest (negative) participant id keeps the guest and succeeds', async () => {
        const created = await http<EventJson>(app, 'POST', '/events', {
            bearer: host.token,
            body: {
                title: 'With guest',
                startTime: inHours(48),
                endTime: inHours(50),
                participants: [member.id],
                ...TEST_ADDRESS
            }
        });
        expect(created.status).toBe(201);
        const eventId = created.body.id;

        const guest = await app.prisma.guestParticipant.create({ data: { displayName: 'Guest' } });
        await app.prisma.attendance.create({ data: { eventId, guestParticipantId: guest.id, status: 'ACCEPTED' } });

        const fetched = await http<EventJson>(app, 'GET', `/events/${eventId}`, { bearer: host.token });
        const ids = fetched.body.participants.map((participant) => participant.id);
        expect(ids).toContain(-guest.id);

        // The edit form sends back every participant id it was given, guests included.
        const patched = await http(app, 'PATCH', `/events/${eventId}`, {
            bearer: host.token,
            body: { participants: ids, title: 'With guest, edited' }
        });
        expect(patched.status).toBe(200);

        expect(await app.prisma.attendance.count({ where: { eventId, guestParticipantId: guest.id } })).toBe(1);
        expect(await app.prisma.attendance.count({ where: { eventId, userId: member.id } })).toBe(1);
        expect(await app.prisma.attendance.count({ where: { eventId } })).toBe(2);
    });
});
