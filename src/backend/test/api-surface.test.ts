import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
    createApiToken,
    createUser,
    http,
    startTestApp,
    TEST_ADDRESS,
    TEST_ADDRESS_2,
    type TestApp,
    type TestUser
} from './helpers.js';

type EventParticipant = {
    id: number;
    username: string;
    status: string;
    isGuest?: boolean;
    featureIds?: number[];
    transportMode?: string;
    driverId?: number;
    hasPaid?: boolean;
};

type EventJson = {
    id: number;
    hostId: number;
    title: string;
    isPrivate: boolean;
    participants: EventParticipant[];
    coHosts: Array<{ id: number; username: string }>;
};

type AuditEntry = {
    id: number;
    eventId: number;
    actorId: number;
    actionType: string;
    createdAt: string;
};

type GuestInviteJson = {
    url: string;
    guestUserId: number;
    expiresAt: string;
};

type GuestInviteViewJson = {
    event: EventJson;
    guestUserId: number;
    canEdit: boolean;
    isDeadlinePassed: boolean;
};

function futureDate(hours: number): Date {
    return new Date(Date.now() + hours * 60 * 60 * 1000);
}

function calendarRange(days: number): { start: string; end: string } {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + days);
    return { start: start.toISOString(), end: end.toISOString() };
}

describe('API surface through personal tokens', () => {
    let app: TestApp;
    let host: TestUser;
    let member: TestUser;
    let outsider: TestUser;
    let stranger: TestUser;
    let admin: TestUser;
    let hostRead: string;
    let hostWrite: string;
    let memberWrite: string;
    let outsiderWrite: string;
    let strangerRead: string;

    beforeAll(async () => {
        app = await startTestApp();
        host = await createUser(app, 'host');
        member = await createUser(app, 'member');
        outsider = await createUser(app, 'outsider');
        stranger = await createUser(app, 'stranger');
        admin = await createUser(app, 'admin', { admin: true });

        hostRead = (await createApiToken(app, host, 'read', 'Host read')).token;
        hostWrite = (await createApiToken(app, host, 'write', 'Host write')).token;
        memberWrite = (await createApiToken(app, member, 'write', 'Member write')).token;
        outsiderWrite = (await createApiToken(app, outsider, 'write', 'Outsider write')).token;
        strangerRead = (await createApiToken(app, stranger, 'read', 'Stranger read')).token;
    }, 120_000);

    afterAll(async () => {
        await app.close();
    });

    test('runs the full event lifecycle with read and write tokens', async () => {
        const start = futureDate(48);
        const end = futureDate(50);
        const range = calendarRange(7);

        const created = await http<EventJson>(app, 'POST', '/events', {
            apiToken: hostWrite,
            body: {
                title: 'Token integration event',
                features: [{ featureId: 1, price: 12.5 }, { featureId: 2 }, { featureId: 4 }],
                description: 'Created through a personal API token',
                startTime: start.toISOString(),
                endTime: end.toISOString(),
                isPrivate: true,
                participants: [member.id],
                ...TEST_ADDRESS
            }
        });
        expect(created.status).toBe(201);
        expect(created.body.hostId).toBe(host.id);
        expect(created.body.isPrivate).toBe(true);
        expect(created.body.participants.map((participant) => participant.id)).toContain(member.id);
        expect(created.body.participants.find((participant) => participant.id === member.id)?.status).toBe('PENDING');

        const eventId = created.body.id;

        const calendar = await http<EventJson[]>(app, 'GET', `/events?start=${range.start}&end=${range.end}`, {
            apiToken: hostRead
        });
        expect(calendar.status).toBe(200);
        expect(calendar.body.some((event) => event.id === eventId)).toBe(true);

        const upcoming = await http<EventJson[]>(app, 'GET', '/events/upcoming', { apiToken: hostRead });
        expect(upcoming.status).toBe(200);
        expect(upcoming.body.some((event) => event.id === eventId)).toBe(true);

        const fetched = await http<EventJson>(app, 'GET', `/events/${eventId}`, { apiToken: hostRead });
        expect(fetched.status).toBe(200);
        expect(fetched.body.title).toBe('Token integration event');

        const hidden = await http(app, 'GET', `/events/${eventId}`, { apiToken: outsiderWrite });
        expect(hidden.status).toBe(404);

        const deniedUpdate = await http(app, 'PATCH', `/events/${eventId}`, {
            apiToken: hostRead,
            body: { title: 'Read tokens cannot write' }
        });
        expect(deniedUpdate.status).toBe(403);

        const updated = await http<EventJson>(app, 'PATCH', `/events/${eventId}`, {
            apiToken: hostWrite,
            body: { title: 'Updated through token', ...TEST_ADDRESS_2 }
        });
        expect(updated.status).toBe(200);
        expect(updated.body.title).toBe('Updated through token');

        const moved = await http(app, 'PATCH', `/events/${eventId}`, {
            apiToken: memberWrite,
            body: { title: 'Hijacked' }
        });
        expect(moved.status).toBe(403);

        const invited = await http<{ message: string }>(app, 'POST', `/events/${eventId}/invite`, {
            apiToken: hostWrite,
            body: { username: outsider.username }
        });
        expect(invited.status).toBe(201);
        expect(invited.body.message).toBe('User invited');

        const joined = await http(app, 'POST', `/events/${eventId}/join`, {
            apiToken: memberWrite,
            body: { featureIds: [1, 2] }
        });
        expect(joined.status).toBe(201);

        const outsiderJoined = await http(app, 'POST', `/events/${eventId}/join`, {
            apiToken: outsiderWrite,
            body: { transportMode: 'NEEDS_RIDE' }
        });
        expect(outsiderJoined.status).toBe(201);

        const driverJoined = await http(app, 'POST', `/events/${eventId}/join`, {
            apiToken: memberWrite,
            body: { transportMode: 'DRIVER', vehicleSeats: 4 }
        });
        expect(driverJoined.status).toBe(201);

        const afterJoin = await http<EventJson>(app, 'GET', `/events/${eventId}`, { apiToken: hostRead });
        expect(afterJoin.status).toBe(200);
        const memberParticipant = afterJoin.body.participants.find((participant) => participant.id === member.id);
        expect(memberParticipant?.status).toBe('ACCEPTED');
        expect(memberParticipant?.featureIds).toEqual([1, 2]);

        const ride = await http<EventJson>(app, 'PATCH', `/events/${eventId}/rides`, {
            apiToken: hostWrite,
            body: { passengerIds: [outsider.id], driverId: member.id, direction: 'OUTBOUND' }
        });
        expect(ride.status).toBe(200);
        const outsiderParticipant = ride.body.participants.find((participant) => participant.id === outsider.id);
        expect(outsiderParticipant?.driverId).toBe(member.id);

        const paid = await http(app, 'PATCH', `/events/${eventId}/participants/${outsider.id}/payment`, {
            apiToken: hostWrite,
            body: { hasPaid: true }
        });
        expect(paid.status).toBe(200);

        const audit = await http<AuditEntry[]>(app, 'GET', `/events/${eventId}/audit-log`, { apiToken: hostRead });
        expect(audit.status).toBe(200);
        expect(audit.body.length).toBeGreaterThan(0);
        expect(audit.body.every((entry) => entry.eventId === eventId)).toBe(true);
        expect(audit.body.some((entry) => entry.actionType === 'EVENT_CREATED')).toBe(true);

        const auditForbidden = await http(app, 'GET', `/events/${eventId}/audit-log`, { apiToken: strangerRead });
        expect(auditForbidden.status).toBe(403);

        const leave = await http(app, 'DELETE', `/events/${eventId}/join`, { apiToken: outsiderWrite });
        expect(leave.status).toBe(200);

        const rejoin = await http(app, 'POST', `/events/${eventId}/join`, {
            apiToken: outsiderWrite,
            body: { featureIds: [4] }
        });
        expect(rejoin.status).toBe(201);

        const deniedDelete = await http(app, 'DELETE', `/events/${eventId}`, { apiToken: hostRead });
        expect(deniedDelete.status).toBe(403);

        const removed = await http(app, 'DELETE', `/events/${eventId}`, { apiToken: hostWrite });
        expect(removed.status).toBe(200);

        const gone = await http(app, 'GET', `/events/${eventId}`, { apiToken: hostRead });
        expect(gone.status).toBe(404);
    });

    test('requires a complete street address and leaves legacy locations unchanged', async () => {
        const start = futureDate(60);
        const eventWithAddress = { ...TEST_ADDRESS };
        type AddressEventJson = EventJson & { location?: string; locationDetails?: { placeId: string } };

        const missing = await http(app, 'POST', '/events', {
            apiToken: hostWrite,
            body: { title: 'No address', startTime: start.toISOString() }
        });
        expect(missing.status).toBe(400);

        const freeText = await http(app, 'POST', '/events', {
            apiToken: hostWrite,
            body: { title: 'Free text', startTime: start.toISOString(), location: 'Test hall' }
        });
        expect(freeText.status).toBe(400);

        const created = await http<AddressEventJson>(app, 'POST', '/events', {
            apiToken: hostWrite,
            body: { title: 'Address event', startTime: start.toISOString(), ...eventWithAddress }
        });
        expect(created.status).toBe(201);
        expect(created.body.locationDetails?.placeId).toBe(TEST_ADDRESS.locationDetails.placeId);

        const invalidUpdate = await http(app, 'PATCH', `/events/${created.body.id}`, {
            apiToken: hostWrite,
            body: { location: 'Test hall' }
        });
        expect(invalidUpdate.status).toBe(400);

        const detailsOnly = await http(app, 'PATCH', `/events/${created.body.id}`, {
            apiToken: hostWrite,
            body: { locationDetails: TEST_ADDRESS_2.locationDetails }
        });
        expect(detailsOnly.status).toBe(400);

        const legacy = await app.prisma.event.create({
            data: {
                title: 'Legacy event',
                location: 'Old hall',
                startTime: start,
                hostId: host.id
            }
        });

        const legacyUnchanged = await http(app, 'PATCH', `/events/${legacy.id}`, {
            apiToken: hostWrite,
            body: { location: 'Old hall' }
        });
        expect(legacyUnchanged.status).toBe(200);

        const legacyTitleOnly = await http(app, 'PATCH', `/events/${legacy.id}`, {
            apiToken: hostWrite,
            body: { title: 'Legacy event renamed' }
        });
        expect(legacyTitleOnly.status).toBe(200);

        const legacyMoved = await http<AddressEventJson>(app, 'PATCH', `/events/${legacy.id}`, {
            apiToken: hostWrite,
            body: { ...TEST_ADDRESS }
        });
        expect(legacyMoved.status).toBe(200);
        expect(legacyMoved.body.locationDetails?.placeId).toBe(TEST_ADDRESS.locationDetails.placeId);

        const legacyWithoutLocation = await app.prisma.event.create({
            data: {
                title: 'Legacy event without a location',
                startTime: start,
                hostId: host.id
            }
        });

        const noLocationUnchanged = await http(app, 'PATCH', `/events/${legacyWithoutLocation.id}`, {
            apiToken: hostWrite,
            body: { location: '' }
        });
        expect(noLocationUnchanged.status).toBe(200);
    });

    test('creates and manages guest invites through a write token', async () => {
        const start = futureDate(72);
        const created = await http<EventJson>(app, 'POST', '/events', {
            apiToken: hostWrite,
            body: {
                title: 'Guest invite event',
                features: [{ featureId: 1 }],
                startTime: start.toISOString(),
                endTime: futureDate(74).toISOString(),
                ...TEST_ADDRESS
            }
        });
        expect(created.status).toBe(201);
        const eventId = created.body.id;

        const denied = await http(app, 'POST', `/events/${eventId}/guest-invites`, { apiToken: hostRead });
        expect(denied.status).toBe(403);

        const invite = await http<GuestInviteJson>(app, 'POST', `/events/${eventId}/guest-invites`, {
            apiToken: hostWrite
        });
        expect(invite.status).toBe(201);
        expect(invite.body.url).toContain('/invite/');
        expect(invite.body.guestUserId).toBeLessThan(0);
        expect(new Date(invite.body.expiresAt).getTime()).toBeGreaterThan(Date.now());

        const token = new URL(invite.body.url).pathname.split('/').pop();
        expect(token).toBeTruthy();

        const view = await http<GuestInviteViewJson>(app, 'GET', `/guest-invites/${token ?? ''}`);
        expect(view.status).toBe(200);
        expect(view.body.event.id).toBe(eventId);
        expect(view.body.guestUserId).toBe(invite.body.guestUserId);
        expect(view.body.canEdit).toBe(true);

        const guestName = `guest${Date.now().toString(36)}`.slice(0, 20);
        const updated = await http<GuestInviteViewJson>(app, 'PATCH', `/guest-invites/${token ?? ''}`, {
            body: { username: guestName, featureIds: [1] }
        });
        expect(updated.status).toBe(200);
        expect(
            updated.body.event.participants.some(
                (participant) =>
                    participant.id === invite.body.guestUserId &&
                    participant.username === guestName &&
                    participant.isGuest === true
            )
        ).toBe(true);

        const hostView = await http<EventJson>(app, 'GET', `/events/${eventId}`, { apiToken: hostRead });
        expect(hostView.status).toBe(200);
        expect(hostView.body.participants.some((participant) => participant.username === guestName)).toBe(true);

        const left = await http<GuestInviteViewJson>(app, 'DELETE', `/guest-invites/${token ?? ''}`);
        expect(left.status).toBe(200);
        const declinedGuest = left.body.event.participants.find(
            (participant) => participant.id === invite.body.guestUserId
        );
        expect(declinedGuest?.status).toBe('DECLINED');

        const unknown = await http(app, 'GET', '/guest-invites/not-a-real-invite');
        expect(unknown.status).toBe(404);
    });

    test('manages user payment details and admin-only user operations', async () => {
        const payment = await http<{ paypalLink: string; ibanAccountHolder: string }>(
            app,
            'PATCH',
            '/users/me/payment-info',
            {
                apiToken: hostWrite,
                body: {
                    paypalLink: 'https://paypal.me/tokenhost',
                    ibanAccountHolder: 'Token Host'
                }
            }
        );
        expect(payment.status).toBe(200);
        expect(payment.body.paypalLink).toBe('https://paypal.me/tokenhost');
        expect(payment.body.ibanAccountHolder).toBe('Token Host');

        const own = await http<Record<string, unknown>>(app, 'GET', `/users/${host.id}`, { apiToken: hostRead });
        expect(own.status).toBe(200);
        expect(own.body.paypalLink).toBe('https://paypal.me/tokenhost');

        const publicView = await http<Record<string, unknown>>(app, 'GET', `/users/${host.id}`, {
            apiToken: outsiderWrite
        });
        expect(publicView.status).toBe(200);
        expect(publicView.body).not.toHaveProperty('paypalLink');
        expect(publicView.body).not.toHaveProperty('ibanAccountHolder');

        const list = await http<Array<{ id: number; username: string }>>(app, 'GET', '/users', {
            apiToken: hostRead
        });
        expect(list.status).toBe(200);
        expect(list.body.some((user) => user.id === host.id)).toBe(true);
        expect(list.body.some((user) => user.id === member.id)).toBe(true);

        const adminWrite = (await createApiToken(app, admin, 'write', 'Admin write')).token;
        const adminRead = (await createApiToken(app, admin, 'read', 'Admin read')).token;
        const username = `managed${Date.now().toString(36)}`.slice(0, 30);

        const created = await http<{ id: number; username: string }>(app, 'POST', '/users', {
            apiToken: adminWrite,
            body: { username }
        });
        expect(created.status).toBe(201);

        const renamed = await http<{ username: string }>(app, 'PATCH', `/users/${created.body.id}`, {
            apiToken: adminWrite,
            body: { username: `${username}x` }
        });
        expect(renamed.status).toBe(200);
        expect(renamed.body.username).toBe(`${username}x`);

        const deniedReadDelete = await http(app, 'DELETE', `/users/${created.body.id}`, { apiToken: adminRead });
        expect(deniedReadDelete.status).toBe(403);

        const deleted = await http(app, 'DELETE', `/users/${created.body.id}`, { apiToken: adminWrite });
        expect(deleted.status).toBe(200);

        const notAdmin = await http(app, 'POST', '/users', {
            apiToken: hostWrite,
            body: { username: `nope${Date.now().toString(36)}`.slice(0, 30) }
        });
        expect(notAdmin.status).toBe(403);
    });

    test('manages user groups through a write token', async () => {
        const name = `Group ${Date.now().toString(36)}`;
        const created = await http<{ id: number; name: string; memberIds: number[] }>(app, 'POST', '/user-groups', {
            apiToken: hostWrite,
            body: { name, memberIds: [member.id, outsider.id, member.id] }
        });
        expect(created.status).toBe(201);
        expect(created.body.name).toBe(name);
        expect(created.body.memberIds).toEqual([member.id, outsider.id]);

        const list = await http<Array<{ id: number; name: string }>>(app, 'GET', '/user-groups', {
            apiToken: hostRead
        });
        expect(list.status).toBe(200);
        expect(list.body.some((group) => group.id === created.body.id)).toBe(true);

        const fetched = await http<{ id: number; name: string }>(app, 'GET', `/user-groups/${created.body.id}`, {
            apiToken: hostRead
        });
        expect(fetched.status).toBe(200);
        expect(fetched.body.name).toBe(name);

        const hidden = await http(app, 'GET', `/user-groups/${created.body.id}`, { apiToken: memberWrite });
        expect(hidden.status).toBe(404);

        const updated = await http<{ name: string; memberIds: number[] }>(
            app,
            'PATCH',
            `/user-groups/${created.body.id}`,
            {
                apiToken: hostWrite,
                body: { name: `${name} updated`, memberIds: [member.id] }
            }
        );
        expect(updated.status).toBe(200);
        expect(updated.body.name).toBe(`${name} updated`);
        expect(updated.body.memberIds).toEqual([member.id]);

        const duplicate = await http(app, 'POST', '/user-groups', {
            apiToken: hostWrite,
            body: { name: `${name} updated`, memberIds: [] }
        });
        expect(duplicate.status).toBe(409);

        const denied = await http(app, 'POST', '/user-groups', {
            apiToken: hostRead,
            body: { name: 'Read only group', memberIds: [] }
        });
        expect(denied.status).toBe(403);

        const deleted = await http(app, 'DELETE', `/user-groups/${created.body.id}`, { apiToken: hostWrite });
        expect(deleted.status).toBe(200);

        const gone = await http(app, 'GET', `/user-groups/${created.body.id}`, { apiToken: hostRead });
        expect(gone.status).toBe(404);
    });

    test('manages chat notification preferences and FCM subscriptions', async () => {
        const start = futureDate(96);
        const created = await http<EventJson>(app, 'POST', '/events', {
            apiToken: hostWrite,
            body: { title: 'Notification event', startTime: start.toISOString(), ...TEST_ADDRESS }
        });
        expect(created.status).toBe(201);
        const eventId = created.body.id;

        const empty = await http<number[]>(app, 'GET', '/notifications/mute', { apiToken: hostRead });
        expect(empty.status).toBe(200);
        expect(empty.body).toEqual([]);

        const denied = await http(app, 'POST', `/notifications/mute/${eventId}`, { apiToken: hostRead });
        expect(denied.status).toBe(403);

        const muted = await http(app, 'POST', `/notifications/mute/${eventId}`, { apiToken: hostWrite });
        expect(muted.status).toBe(201);
        const mutedAgain = await http(app, 'POST', `/notifications/mute/${eventId}`, { apiToken: hostWrite });
        expect(mutedAgain.status).toBe(200);

        const list = await http<number[]>(app, 'GET', '/notifications/mute', { apiToken: hostRead });
        expect(list.status).toBe(200);
        expect(list.body).toContain(eventId);

        const unmuted = await http(app, 'DELETE', `/notifications/mute/${eventId}`, { apiToken: hostWrite });
        expect(unmuted.status).toBe(200);
        const unmutedAgain = await http(app, 'DELETE', `/notifications/mute/${eventId}`, { apiToken: hostWrite });
        expect(unmutedAgain.status).toBe(404);

        const fcmToken = `fcm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
        const deniedSubscribe = await http(app, 'POST', '/notifications/subscribe', {
            apiToken: hostRead,
            body: { token: 'should-not-exist' }
        });
        expect(deniedSubscribe.status).toBe(403);

        const subscribed = await http(app, 'POST', '/notifications/subscribe', {
            apiToken: hostWrite,
            body: { token: fcmToken }
        });
        expect(subscribed.status).toBe(201);
        const stored = await app.prisma.fcmToken.findUnique({ where: { token: fcmToken } });
        expect(stored?.userId).toBe(host.id);

        const unsubscribed = await http(app, 'POST', '/notifications/unsubscribe', {
            apiToken: hostWrite,
            body: { token: fcmToken }
        });
        expect(unsubscribed.status).toBe(201);
        const removed = await app.prisma.fcmToken.findUnique({ where: { token: fcmToken } });
        expect(removed).toBeNull();
    });

    test('reads chat history and uploads media with the right scope', async () => {
        const start = futureDate(120);
        const created = await http<EventJson>(app, 'POST', '/events', {
            apiToken: hostWrite,
            body: { title: 'Chat event', startTime: start.toISOString(), ...TEST_ADDRESS }
        });
        expect(created.status).toBe(201);
        const eventId = created.body.id;

        const history = await http<{ messages: unknown[]; nextCursor: number | null }>(
            app,
            'GET',
            `/chat/${eventId}/messages`,
            { apiToken: hostRead }
        );
        expect(history.status).toBe(200);
        expect(history.body.messages).toEqual([]);
        expect(history.body.nextCursor).toBeNull();

        const pinned = await http<unknown[]>(app, 'GET', `/chat/${eventId}/pinned`, { apiToken: hostRead });
        expect(pinned.status).toBe(200);
        expect(pinned.body).toEqual([]);

        const outsiderHistory = await http(app, 'GET', `/chat/${eventId}/messages`, { apiToken: outsiderWrite });
        expect(outsiderHistory.status).toBe(403);

        const deniedUpload = new FormData();
        deniedUpload.append('file', new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/mpeg' }), 'clip.mp3');
        const denied = await http(app, 'POST', `/chat/${eventId}/upload`, {
            apiToken: hostRead,
            form: deniedUpload
        });
        expect(denied.status).toBe(403);

        const form = new FormData();
        form.append('file', new Blob([new Uint8Array([1, 2, 3, 4])], { type: 'audio/mpeg' }), 'clip.mp3');
        const uploaded = await http<{ mediaUrl: string; mediaType: string }>(app, 'POST', `/chat/${eventId}/upload`, {
            apiToken: hostWrite,
            form
        });
        expect(uploaded.status).toBe(201);
        expect(uploaded.body.mediaType).toBe('audio');
        expect(uploaded.body.mediaUrl).toStartWith(`uploads/chat/${eventId}/`);
        expect(uploaded.body.mediaUrl).toEndWith('.mp3');

        await rm(join(process.cwd(), 'uploads', 'chat', String(eventId)), { recursive: true, force: true });
    });
});
