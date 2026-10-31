import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createUser, http, startTestApp, TEST_ADDRESS, type TestApp, type TestUser } from './helpers.js';

type FeatureJson = { id: number; name: string; emoji: string };
type EventJson = {
    id: number;
    features: Array<FeatureJson & { price: number | null }>;
    participants: Array<{ id: number; featureIds: number[] }>;
};

const inHours = (hours: number) => new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

describe('instance features', () => {
    let app: TestApp;
    let admin: TestUser;
    let host: TestUser;
    let guest: TestUser;

    beforeAll(async () => {
        app = await startTestApp();
        admin = await createUser(app, 'admin', { admin: true });
        host = await createUser(app, 'host');
        guest = await createUser(app, 'guest');
    }, 120_000);

    afterAll(async () => {
        await app.close();
    });

    const createEvent = async (features: Array<{ featureId: number; price?: number }>) => {
        const created = await http<EventJson>(app, 'POST', '/events', {
            bearer: host.token,
            body: { title: 'Featured', startTime: inHours(48), endTime: inHours(50), features, ...TEST_ADDRESS }
        });
        expect(created.status).toBe(201);
        return created.body;
    };

    test('lists the five seeded features to any signed-in user', async () => {
        const list = await http<FeatureJson[]>(app, 'GET', '/features', { bearer: host.token });
        expect(list.status).toBe(200);
        expect(list.body.map((feature) => feature.name)).toEqual(['Food', 'Weed', 'Alcohol', 'Beer', 'Sleep']);
        expect(list.body[0]).toEqual({ id: 1, name: 'Food', emoji: '🍗' });

        expect((await http(app, 'GET', '/features')).status).toBe(401);
    });

    test('only admins can create, update and delete features', async () => {
        const body = { name: 'Nope', emoji: '🚫' };
        expect((await http(app, 'POST', '/features', { bearer: host.token, body })).status).toBe(403);
        expect((await http(app, 'PATCH', '/features/1', { bearer: host.token, body })).status).toBe(403);
        expect((await http(app, 'DELETE', '/features/1', { bearer: host.token })).status).toBe(403);
    });

    test('creates, renames and rejects duplicate names and emojis', async () => {
        const created = await http<FeatureJson>(app, 'POST', '/features', {
            bearer: admin.token,
            body: { name: '  Karaoke ', emoji: '🎤' }
        });
        expect(created.status).toBe(201);
        expect(created.body).toMatchObject({ name: 'Karaoke', emoji: '🎤' });

        const sameNameOtherCase = await http(app, 'POST', '/features', {
            bearer: admin.token,
            body: { name: 'kARAOKE', emoji: '🎶' }
        });
        expect(sameNameOtherCase.status).toBe(409);

        const sameNameAsSeed = await http(app, 'POST', '/features', {
            bearer: admin.token,
            body: { name: 'beer', emoji: '🥂' }
        });
        expect(sameNameAsSeed.status).toBe(409);

        const sameEmoji = await http(app, 'POST', '/features', {
            bearer: admin.token,
            body: { name: 'Singing', emoji: '🎤' }
        });
        expect(sameEmoji.status).toBe(409);

        const renamed = await http<FeatureJson>(app, 'PATCH', `/features/${created.body.id}`, {
            bearer: admin.token,
            body: { name: 'KARAOKE' }
        });
        expect(renamed.status).toBe(200);
        expect(renamed.body).toMatchObject({ name: 'KARAOKE', emoji: '🎤' });

        const renameIntoSeed = await http(app, 'PATCH', `/features/${created.body.id}`, {
            bearer: admin.token,
            body: { name: 'Sleep' }
        });
        expect(renameIntoSeed.status).toBe(409);

        expect((await http(app, 'PATCH', '/features/9999', { bearer: admin.token, body: { name: 'X' } })).status).toBe(
            404
        );
    });

    test('validates the payload', async () => {
        for (const body of [
            { name: '', emoji: '🎤' },
            { name: 'x'.repeat(33), emoji: '🎤' },
            { name: 'Text emoji', emoji: 'ab' },
            { name: 'Two emojis', emoji: '🎤🎶' },
            { name: 'No emoji' }
        ]) {
            const response = await http(app, 'POST', '/features', { bearer: admin.token, body });
            expect(response.status).toBe(400);
        }

        const flag = await http<FeatureJson>(app, 'POST', '/features', {
            bearer: admin.token,
            body: { name: 'Flags', emoji: '🇮🇹' }
        });
        expect(flag.status).toBe(201);
        const family = await http<FeatureJson>(app, 'POST', '/features', {
            bearer: admin.token,
            body: { name: 'Family', emoji: '👨‍👩‍👧' }
        });
        expect(family.status).toBe(201);
    });

    test('events offer chosen features with prices and participants opt in', async () => {
        const event = await createEvent([{ featureId: 1, price: 20 }, { featureId: 5 }]);
        expect(event.features).toEqual([
            { id: 1, name: 'Food', emoji: '🍗', price: 20 },
            { id: 5, name: 'Sleep', emoji: '🌙', price: null }
        ]);

        const joined = await http(app, 'POST', `/events/${event.id}/join`, {
            bearer: guest.token,
            body: { featureIds: [5] }
        });
        expect(joined.status).toBe(201);

        const offeredOnly = await http(app, 'POST', `/events/${event.id}/join`, {
            bearer: guest.token,
            body: { featureIds: [1, 2] }
        });
        expect(offeredOnly.status).toBe(400);

        const view = await http<EventJson>(app, 'GET', `/events/${event.id}`, { bearer: host.token });
        expect(view.body.participants.find((p) => p.id === guest.id)?.featureIds).toEqual([5]);

        const left = await http(app, 'DELETE', `/events/${event.id}/join`, { bearer: guest.token });
        expect(left.status).toBe(200);
        const afterLeave = await http<EventJson>(app, 'GET', `/events/${event.id}`, { bearer: host.token });
        expect(afterLeave.body.participants.find((p) => p.id === guest.id)?.featureIds).toEqual([]);
    });

    test('rejects unknown feature ids when creating or updating an event', async () => {
        const bad = await http(app, 'POST', '/events', {
            bearer: host.token,
            body: { title: 'Bad', startTime: inHours(48), features: [{ featureId: 9999 }], ...TEST_ADDRESS }
        });
        expect(bad.status).toBe(400);

        const event = await createEvent([{ featureId: 1 }]);
        const badUpdate = await http(app, 'PATCH', `/events/${event.id}`, {
            bearer: host.token,
            body: { features: [{ featureId: 9999 }] }
        });
        expect(badUpdate.status).toBe(400);
    });

    test('removing a feature from an event clears it for participants; omitting features keeps them', async () => {
        const event = await createEvent([{ featureId: 1 }, { featureId: 2 }]);
        await http(app, 'POST', `/events/${event.id}/join`, { bearer: guest.token, body: { featureIds: [1, 2] } });

        const untouched = await http<EventJson>(app, 'PATCH', `/events/${event.id}`, {
            bearer: host.token,
            body: { title: 'Renamed' }
        });
        expect(untouched.body.features.map((feature) => feature.id)).toEqual([1, 2]);

        const updated = await http<EventJson>(app, 'PATCH', `/events/${event.id}`, {
            bearer: host.token,
            body: { features: [{ featureId: 2, price: 7 }] }
        });
        expect(updated.status).toBe(200);
        expect(updated.body.features).toEqual([{ id: 2, name: 'Weed', emoji: '🌿', price: 7 }]);
        expect(updated.body.participants.find((p) => p.id === guest.id)?.featureIds).toEqual([2]);
    });

    test('deleting a feature removes it from events and participants', async () => {
        const custom = await http<FeatureJson>(app, 'POST', '/features', {
            bearer: admin.token,
            body: { name: 'Games', emoji: '🎲' }
        });
        const event = await createEvent([{ featureId: custom.body.id, price: 3 }]);
        await http(app, 'POST', `/events/${event.id}/join`, {
            bearer: guest.token,
            body: { featureIds: [custom.body.id] }
        });

        const removed = await http(app, 'DELETE', `/features/${custom.body.id}`, { bearer: admin.token });
        expect(removed.status).toBe(200);
        expect((await http(app, 'DELETE', `/features/${custom.body.id}`, { bearer: admin.token })).status).toBe(404);

        const view = await http<EventJson>(app, 'GET', `/events/${event.id}`, { bearer: host.token });
        expect(view.body.features).toEqual([]);
        expect(view.body.participants.find((p) => p.id === guest.id)?.featureIds).toEqual([]);
    });

    test('records feature changes in the audit log', async () => {
        const event = await createEvent([{ featureId: 1 }]);
        await http(app, 'PATCH', `/events/${event.id}`, {
            bearer: host.token,
            body: { features: [{ featureId: 1, price: 9 }, { featureId: 4 }] }
        });
        const audit = await http<Array<{ actionType: string; payloadDiff: { after: Record<string, unknown> } }>>(
            app,
            'GET',
            `/events/${event.id}/audit-log`,
            { bearer: host.token }
        );
        const update = audit.body.find((entry) => entry.actionType === 'EVENT_UPDATED');
        expect(update?.payloadDiff.after.features).toBe('🍗 Food (9), 🍺 Beer');
    });
});

describe('add_custom_features migration', () => {
    test('carries existing flags, prices and opt-ins over to the new tables', async () => {
        const db = await PGlite.create();
        const dir = join(import.meta.dir, '..', 'prisma', 'migrations');
        const names = readdirSync(dir)
            .filter((entry) => !entry.startsWith('.') && entry !== 'migration_lock.toml')
            .sort();
        const target = names.indexOf('20261030120000_add_custom_features');
        expect(target).toBeGreaterThan(0);

        const run = (name: string) => db.exec(readFileSync(join(dir, name, 'migration.sql'), 'utf8'));
        for (const name of names.slice(0, target)) await run(name);

        await db.exec(`
            INSERT INTO "User" ("username") VALUES ('legacy-host'), ('legacy-guest');
            INSERT INTO "Event" ("title", "startTime", "hostId", "hasFood", "foodPrice", "hasSleep", "sleepPrice", "hasBeer", "weedPrice")
            VALUES ('Legacy', now(), 1, true, 12.5, true, NULL, false, 99);
            INSERT INTO "Attendance" ("userId", "eventId", "status", "wantsFood", "wantsBeer")
            VALUES (2, 1, 'ACCEPTED', true, true);
        `);

        await run(names[target]);
        for (const name of names.slice(target + 1)) await run(name);

        const offered = await db.query<{ nameKey: string; price: number | null }>(
            `SELECT f."nameKey", ef."price" FROM "EventFeature" ef JOIN "Feature" f ON f."id" = ef."featureId" ORDER BY f."id"`
        );
        expect(offered.rows).toEqual([
            { nameKey: 'food', price: 12.5 },
            { nameKey: 'sleep', price: null }
        ]);

        const optedIn = await db.query<{ nameKey: string }>(
            `SELECT f."nameKey" FROM "AttendanceFeature" af JOIN "Feature" f ON f."id" = af."featureId" ORDER BY f."id"`
        );
        expect(optedIn.rows.map((row) => row.nameKey)).toEqual(['food', 'beer']);

        const columns = await db.query<{ column_name: string }>(
            `SELECT column_name FROM information_schema.columns WHERE table_name = 'Event' AND column_name IN ('hasFood', 'foodPrice')`
        );
        expect(columns.rows).toEqual([]);
        await db.close();
    });
});
