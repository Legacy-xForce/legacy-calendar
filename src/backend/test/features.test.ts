import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createUser, http, startTestApp, TEST_ADDRESS, type TestApp, type TestUser } from './helpers.js';

type FeatureJson = { id: number; name: string; emoji: string };
type EventFeatureJson = FeatureJson & {
    price: number | null;
    mandatory: boolean;
    oneTime: boolean;
    eligibleUserIds: number[];
};
type EventJson = {
    id: number;
    features: EventFeatureJson[];
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

    type FeatureInput = {
        featureId?: number;
        name?: string;
        emoji?: string;
        price?: number;
        mandatory?: boolean;
        eligibleUserIds?: number[];
    };
    const createEvent = async (features: FeatureInput[], extra: Record<string, unknown> = {}) => {
        const created = await http<EventJson>(app, 'POST', '/events', {
            bearer: host.token,
            body: {
                title: 'Featured',
                startTime: inHours(48),
                endTime: inHours(50),
                features,
                ...extra,
                ...TEST_ADDRESS
            }
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
        expect(event.features).toMatchObject([
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
        expect(updated.body.features).toMatchObject([{ id: 2, name: 'Weed', emoji: '🌿', price: 7 }]);
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

describe('one-time, mandatory and restricted event features', () => {
    let app: TestApp;
    let admin: TestUser;
    let host: TestUser;
    let alice: TestUser;
    let bob: TestUser;

    beforeAll(async () => {
        app = await startTestApp();
        admin = await createUser(app, 'admin2', { admin: true });
        host = await createUser(app, 'host2');
        alice = await createUser(app, 'alice');
        bob = await createUser(app, 'bob');
    }, 120_000);

    afterAll(async () => {
        await app.close();
    });

    const create = (features: unknown[], extra: Record<string, unknown> = {}) =>
        http<EventJson>(app, 'POST', '/events', {
            bearer: host.token,
            body: { title: 'Party', startTime: inHours(48), endTime: inHours(50), features, ...extra, ...TEST_ADDRESS }
        });
    const join = (eventId: number, user: TestUser, body: unknown = {}) =>
        http<{ features?: unknown }>(app, 'POST', `/events/${eventId}/join`, { bearer: user.token, body });
    const view = async (eventId: number) =>
        (await http<EventJson>(app, 'GET', `/events/${eventId}`, { bearer: host.token })).body;
    const featuresOf = (event: EventJson, user: TestUser) =>
        [...(event.participants.find((p) => p.id === user.id)?.featureIds ?? [])].sort();

    test('hosts create one-time features that stay out of the catalog', async () => {
        const created = await create([{ name: ' Karaoke ', emoji: '🎤', price: 12 }, { featureId: 1 }]);
        expect(created.status).toBe(201);
        const karaoke = created.body.features.find((f) => f.name === 'Karaoke');
        expect(karaoke).toMatchObject({ emoji: '🎤', price: 12, oneTime: true, mandatory: false, eligibleUserIds: [] });

        const catalog = await http<FeatureJson[]>(app, 'GET', '/features', { bearer: host.token });
        expect(catalog.body.map((f) => f.name)).not.toContain('Karaoke');
        const id = karaoke?.id ?? 0;
        expect((await http(app, 'PATCH', `/features/${id}`, { bearer: admin.token, body: { name: 'X' } })).status).toBe(
            404
        );
        expect((await http(app, 'DELETE', `/features/${id}`, { bearer: admin.token })).status).toBe(404);

        // The same name and emoji are free for other events and for the catalog.
        expect((await create([{ name: 'Karaoke', emoji: '🎤' }])).status).toBe(201);
        const asCatalog = await http(app, 'POST', '/features', {
            bearer: admin.token,
            body: { name: 'Karaoke', emoji: '🎤' }
        });
        expect(asCatalog.status).toBe(201);
    });

    test('validates one-time features', async () => {
        expect((await create([{ name: 'No emoji' }])).status).toBe(400);
        expect((await create([{ featureId: 1, name: 'Both', emoji: '🎤' }])).status).toBe(400);
        expect((await create([{ name: 'Food', emoji: '🥕' }, { featureId: 1 }])).status).toBe(400);
        expect((await create([{ name: 'Dup', emoji: '🍗' }, { featureId: 1 }])).status).toBe(400);
        const tooMany = Array.from({ length: 11 }, (_, i) => ({
            name: `Extra ${i}`,
            emoji: ['😀', '😁', '😂', '😃', '😄', '😅', '😆', '😇', '😈', '😉', '😊'][i]
        }));
        expect((await create(tooMany)).status).toBe(400);
    });

    test('an event cannot reference another event’s one-time feature; dropped ones are deleted', async () => {
        const first = await create([{ name: 'Secret', emoji: '🤫' }]);
        const secretId = first.body.features[0]?.id ?? 0;
        const second = await create([]);
        const stolen = await http(app, 'PATCH', `/events/${second.body.id}`, {
            bearer: host.token,
            body: { features: [{ featureId: secretId }] }
        });
        expect(stolen.status).toBe(400);

        const kept = await http<EventJson>(app, 'PATCH', `/events/${first.body.id}`, {
            bearer: host.token,
            body: { features: [{ featureId: secretId, price: 5 }] }
        });
        expect(kept.body.features).toMatchObject([{ id: secretId, price: 5, oneTime: true }]);
        await http(app, 'PATCH', `/events/${first.body.id}`, { bearer: host.token, body: { features: [] } });
        expect(await app.prisma.feature.count({ where: { id: secretId } })).toBe(0);

        const doomed = await create([{ name: 'Gone', emoji: '👻' }]);
        const doomedId = doomed.body.features[0]?.id ?? 0;
        await http(app, 'DELETE', `/events/${doomed.body.id}`, { bearer: host.token });
        expect(await app.prisma.feature.count({ where: { id: doomedId } })).toBe(0);
    });

    test('mandatory features are always part of a joiner’s selection', async () => {
        const event = await create([{ featureId: 1, mandatory: true }, { featureId: 2 }]);
        expect((await join(event.body.id, alice)).status).toBe(201);
        expect(featuresOf(await view(event.body.id), alice)).toEqual([1]);

        await join(event.body.id, alice, { featureIds: [2] });
        expect(featuresOf(await view(event.body.id), alice)).toEqual([1, 2]);
        await join(event.body.id, alice, { featureIds: [] });
        expect(featuresOf(await view(event.body.id), alice)).toEqual([1]);

        await http(app, 'DELETE', `/events/${event.body.id}/join`, { bearer: alice.token });
        expect(featuresOf(await view(event.body.id), alice)).toEqual([]);
        await join(event.body.id, alice);
        expect(featuresOf(await view(event.body.id), alice)).toEqual([1]);
    });

    test('making a feature mandatory backfills accepted participants only', async () => {
        const event = await create([{ featureId: 1 }], { participants: [bob.id] });
        await join(event.body.id, alice);
        await http(app, 'PATCH', `/events/${event.body.id}`, {
            bearer: host.token,
            body: { features: [{ featureId: 1, mandatory: true }] }
        });
        const after = await view(event.body.id);
        expect(featuresOf(after, alice)).toEqual([1]);
        expect(featuresOf(after, bob)).toEqual([]);

        // Omitted flags keep their value on later edits.
        const again = await http<EventJson>(app, 'PATCH', `/events/${event.body.id}`, {
            bearer: host.token,
            body: { features: [{ featureId: 1, price: 4 }] }
        });
        expect(again.body.features[0]?.mandatory).toBe(true);
    });

    test('restricted features can only be taken by eligible users', async () => {
        const event = await create([{ featureId: 1, eligibleUserIds: [alice.id] }, { featureId: 2 }]);
        expect((await join(event.body.id, bob, { featureIds: [1] })).status).toBe(403);
        expect((await join(event.body.id, bob, { featureIds: [2] })).status).toBe(201);
        expect((await join(event.body.id, alice, { featureIds: [1, 2] })).status).toBe(201);

        await http(app, 'PATCH', `/events/${event.body.id}`, {
            bearer: host.token,
            body: { features: [{ featureId: 1, eligibleUserIds: [bob.id] }, { featureId: 2 }] }
        });
        const after = await view(event.body.id);
        expect(featuresOf(after, alice)).toEqual([2]);
        expect(after.features[0]?.eligibleUserIds).toEqual([bob.id]);
    });

    test('mandatory plus restricted only applies to eligible users', async () => {
        const event = await create([{ featureId: 1, mandatory: true, eligibleUserIds: [alice.id] }]);
        await join(event.body.id, alice);
        await join(event.body.id, bob);
        const after = await view(event.body.id);
        expect(featuresOf(after, alice)).toEqual([1]);
        expect(featuresOf(after, bob)).toEqual([]);
    });

    test('guests get mandatory features but cannot take restricted ones', async () => {
        const event = await create([
            { featureId: 1, mandatory: true },
            { featureId: 2, eligibleUserIds: [alice.id] }
        ]);
        const invite = await http<{ url: string }>(app, 'POST', `/events/${event.body.id}/guest-invites`, {
            bearer: host.token
        });
        const token = new URL(invite.body.url).pathname.split('/').pop() ?? '';
        const denied = await http(app, 'PATCH', `/guest-invites/${token}`, {
            body: { username: 'guesty', featureIds: [2] }
        });
        expect(denied.status).toBe(403);
        const ok = await http(app, 'PATCH', `/guest-invites/${token}`, {
            body: { username: 'guesty', featureIds: [] }
        });
        expect(ok.status).toBe(200);
        const guest = (await view(event.body.id)).participants.find((p) => p.id < 0);
        expect(guest?.featureIds).toEqual([1]);
    });

    test('only managers change features and the audit log shows the flags', async () => {
        const event = await create([{ featureId: 1 }]);
        const denied = await http(app, 'PATCH', `/events/${event.body.id}`, {
            bearer: alice.token,
            body: { features: [{ featureId: 1, mandatory: true }] }
        });
        expect(denied.status).toBe(403);

        await http(app, 'PATCH', `/events/${event.body.id}`, {
            bearer: host.token,
            body: { features: [{ featureId: 1, mandatory: true, eligibleUserIds: [alice.id] }] }
        });
        const audit = await http<Array<{ actionType: string; payloadDiff: { after: Record<string, unknown> } }>>(
            app,
            'GET',
            `/events/${event.body.id}/audit-log`,
            { bearer: host.token }
        );
        const update = audit.body.find((entry) => entry.actionType === 'EVENT_UPDATED');
        expect(update?.payloadDiff.after.features).toBe('🍗 Food [required, 1 people only]');
    });
});

describe('add_one_time_features migration', () => {
    test('keeps catalog names unique but allows them per event', async () => {
        const fails = (promise: Promise<unknown>) =>
            promise.then(
                () => false,
                () => true
            );
        const db = await PGlite.create();
        const dir = join(import.meta.dir, '..', 'prisma', 'migrations');
        const names = readdirSync(dir)
            .filter((entry) => !entry.startsWith('.') && entry !== 'migration_lock.toml')
            .sort();
        for (const name of names) await db.exec(readFileSync(join(dir, name, 'migration.sql'), 'utf8'));

        await db.exec(`INSERT INTO "User" ("username") VALUES ('h');
            INSERT INTO "Event" ("title", "startTime", "hostId") VALUES ('A', now(), 1), ('B', now(), 1);`);
        expect(
            await fails(db.exec(`INSERT INTO "Feature" ("name", "nameKey", "emoji") VALUES ('Food', 'food', '🥕')`))
        ).toBe(true);
        expect(
            await fails(db.exec(`INSERT INTO "Feature" ("name", "nameKey", "emoji") VALUES ('Other', 'other', '🍗')`))
        ).toBe(true);
        await db.exec(`INSERT INTO "Feature" ("name", "nameKey", "emoji", "eventId")
            VALUES ('Food', 'food', '🍗', 1), ('Food', 'food', '🍗', 2)`);
        expect(
            await fails(
                db.exec(
                    `INSERT INTO "Feature" ("name", "nameKey", "emoji", "eventId") VALUES ('Food', 'food', '🥕', 1)`
                )
            )
        ).toBe(true);
        await db.close();
    });
});
