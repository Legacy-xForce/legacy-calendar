import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import {
    createApiToken,
    createUser,
    http,
    startTestApp,
    TEST_ADDRESS,
    type TestApp,
    type TestUser
} from './helpers.js';

type LinkMetadata = { id: number; tokenHint: string; createdAt: string; token?: string };
type EventJson = { id: number; title: string };

const feedPath = (token: string) => `/calendar-feed/feed/${token}.ics`;

function futureDate(hours: number): string {
    return new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();
}

function createEvent(app: TestApp, user: TestUser, title: string, isPrivate = false) {
    return http<EventJson>(app, 'POST', '/events', {
        bearer: user.token,
        body: {
            title,
            description: 'A description, with punctuation; and a newline\ninside',
            isPrivate,
            startTime: futureDate(48),
            endTime: futureDate(50),
            ...TEST_ADDRESS
        }
    });
}

describe('Calendar ICS feed', () => {
    let app: TestApp;
    let owner: TestUser;
    let outsider: TestUser;
    let ownerToken: string;

    beforeAll(async () => {
        app = await startTestApp();
        owner = await createUser(app, 'feedowner');
        outsider = await createUser(app, 'feedoutsider');
    }, 120_000);

    afterAll(async () => {
        await app.close();
    });

    test('mints a secret link, stores only its hash, and hides it from later reads', async () => {
        const created = await http<LinkMetadata>(app, 'POST', '/calendar-feed', { bearer: owner.token });
        expect(created.status).toBe(201);
        expect(created.body.token).toMatch(/^legacy-calendar-feed-[0-9a-f-]{36}$/);
        expect(created.body.tokenHint).toContain('…');
        expect(created.body).not.toHaveProperty('tokenHash');
        ownerToken = created.body.token as string;

        const stored = await app.prisma.calendarFeedToken.findUnique({ where: { userId: owner.id } });
        expect(stored?.tokenHash).toBe(createHash('sha256').update(ownerToken).digest('hex'));
        expect(stored?.tokenHint).toBe(created.body.tokenHint);

        const metadata = await http<LinkMetadata>(app, 'GET', '/calendar-feed', { bearer: owner.token });
        expect(metadata.status).toBe(200);
        expect(metadata.body.id).toBe(created.body.id);
        expect(metadata.body.token).toBeUndefined();

        // API tokens cannot mint a new credential-bearing URL.
        const apiToken = await createApiToken(app, owner, 'write', 'Feed helper');
        const denied = await http(app, 'POST', '/calendar-feed', { apiToken: apiToken.token });
        expect(denied.status).toBe(403);
    });

    test('serves a valid ICS document with stable UIDs and escaped fields', async () => {
        const event = await createEvent(app, owner, 'Team Standup, with fun; stuff');
        expect(event.status).toBe(201);

        const response = await http<string>(app, 'GET', feedPath(ownerToken));
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toContain('text/calendar');

        const body = response.body;
        expect(body.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
        expect(body.trimEnd().endsWith('END:VCALENDAR')).toBe(true);
        expect(body).toContain(`UID:event-${event.body.id}@legacy-calendar`);
        expect(body).toContain('SUMMARY:Team Standup\\, with fun\\; stuff');
        expect(body).toContain('DESCRIPTION:A description\\, with punctuation\\; and a newline\\ninside');
        expect(body).toContain('LOCATION:Via Roma 10\\, 00100 Roma\\, Italy');
        expect(body).toContain('GEO:41.9028;12.4964');
        expect(body).toContain(`URL:http://localhost:5173/event/${event.body.id}`);
        expect(body).toMatch(/DTSTART:\d{8}T\d{6}Z\r\n/);
        expect(body).toMatch(/DTEND:\d{8}T\d{6}Z\r\n/);
        expect(body.replace(/\r\n/g, '')).not.toContain('\n'); // RFC 5545 uses CRLF exclusively

        const etag = response.headers.get('etag');
        expect(etag).toMatch(/^"[0-9a-f]{64}"$/);
        const cached = await http<string>(app, 'GET', feedPath(ownerToken), { headers: { 'If-None-Match': etag! } });
        expect(cached.status).toBe(304);
        expect(cached.body).toBeNull();
    });

    test('shows the owner everything they can see, but not other private events', async () => {
        const hidden = await createEvent(app, outsider, 'Outsider secret', true);
        const visible = await createEvent(app, outsider, 'Public gathering');
        expect(hidden.status).toBe(201);
        expect(visible.status).toBe(201);

        // The public event is visible to everyone; the private one is not.
        const response = await http<string>(app, 'GET', feedPath(ownerToken));
        expect(response.status).toBe(200);
        expect(response.body).toContain(`UID:event-${visible.body.id}@legacy-calendar`);
        expect(response.body).not.toContain(`UID:event-${hidden.body.id}@legacy-calendar`);
    });

    test('includes past events, matching the calendar UI', async () => {
        // The API validator only allows future start times, so seed a past event directly.
        const past = await app.prisma.event.create({
            data: {
                title: 'A long forgotten gathering',
                startTime: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000),
                hostId: owner.id
            }
        });

        const response = await http<string>(app, 'GET', feedPath(ownerToken));
        expect(response.status).toBe(200);
        expect(response.body).toContain(`UID:event-${past.id}@legacy-calendar`);
        expect(response.body).toContain('SUMMARY:A long forgotten gathering');
    });

    test('changing an event changes the ETag without changing its UID', async () => {
        const event = await createEvent(app, owner, 'Before the change');
        const before = await http<string>(app, 'GET', feedPath(ownerToken));
        expect(before.body).toContain(`UID:event-${event.body.id}@legacy-calendar`);

        const update = await http(app, 'PATCH', `/events/${event.body.id}`, {
            bearer: owner.token,
            body: { title: 'After the change' }
        });
        expect(update.status).toBe(200);

        const after = await http<string>(app, 'GET', feedPath(ownerToken));
        expect(after.headers.get('etag')).not.toBe(before.headers.get('etag'));
        expect(after.body).toContain('SUMMARY:After the change');
        expect(after.body).toContain(`UID:event-${event.body.id}@legacy-calendar`);
    });

    test('rotation invalidates the old link and revocation removes it entirely', async () => {
        const oldToken = ownerToken;
        const rotated = await http<LinkMetadata>(app, 'POST', '/calendar-feed', { bearer: owner.token });
        expect(rotated.status).toBe(201);
        expect(rotated.body.token).toMatch(/^legacy-calendar-feed-/);
        expect(rotated.body.token).not.toBe(oldToken);
        ownerToken = rotated.body.token as string;

        expect((await http(app, 'GET', feedPath(oldToken))).status).toBe(404);
        expect((await http(app, 'GET', feedPath(ownerToken))).status).toBe(200);

        const revoked = await http(app, 'DELETE', '/calendar-feed', { bearer: owner.token });
        expect(revoked.status).toBe(200);
        expect((await http(app, 'GET', feedPath(ownerToken))).status).toBe(404);
        expect(
            (await http<LinkMetadata | null>(app, 'GET', '/calendar-feed', { bearer: owner.token })).body
        ).toBeNull();

        const missing = await http(app, 'DELETE', '/calendar-feed', { bearer: owner.token });
        expect(missing.status).toBe(404);
        // Leave a working link for any later test in this suite.
        ownerToken = (await http<LinkMetadata>(app, 'POST', '/calendar-feed', { bearer: owner.token })).body
            .token as string;
    });

    test('rejects malformed and unknown feed tokens', async () => {
        expect((await http(app, 'GET', feedPath('not-a-feed-token'))).status).toBe(404);
        expect(
            (await http(app, 'GET', feedPath('legacy-calendar-feed-00000000-0000-0000-0000-000000000000'))).status
        ).toBe(404);
    });
});
