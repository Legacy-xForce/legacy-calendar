import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { io, type Socket } from 'socket.io-client';
import { createUser, http, startTestApp, TEST_ADDRESS, type TestApp, type TestUser } from './helpers.js';

function connect(app: TestApp, user: TestUser): Promise<Socket> {
    return new Promise((resolve, reject) => {
        const socket = io(app.baseUrl, {
            transports: ['websocket'],
            reconnection: false,
            forceNew: true,
            auth: { token: user.token }
        });
        socket.once('connect', () => resolve(socket));
        socket.once('connect_error', reject);
    });
}

function nextEvent<T>(socket: Socket, eventName: string, timeout = 3_000): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${eventName}`)), timeout);
        socket.once(eventName, (payload: T) => {
            clearTimeout(timer);
            resolve(payload);
        });
    });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('event live updates', () => {
    let app: TestApp;
    let host: TestUser;
    let guest: TestUser;
    let stranger: TestUser;
    let eventId: number;
    const sockets: Socket[] = [];

    beforeAll(async () => {
        app = await startTestApp();
        host = await createUser(app, 'livehost');
        guest = await createUser(app, 'liveguest');
        stranger = await createUser(app, 'livestranger');

        const created = await http<{ id: number }>(app, 'POST', '/events', {
            bearer: host.token,
            body: {
                title: 'Live event',
                startTime: new Date(Date.now() + 24 * 3_600_000).toISOString(),
                isPrivate: true,
                ...TEST_ADDRESS
            }
        });
        if (created.status !== 201) throw new Error(`Could not create event: ${JSON.stringify(created.body)}`);
        eventId = created.body.id;
        await http(app, 'POST', `/events/${eventId}/invite`, {
            bearer: host.token,
            body: { username: guest.username }
        });
    }, 120_000);

    afterAll(async () => {
        for (const socket of sockets) socket.close();
        await app.close();
    });

    test('watchers are told when someone joins; users who cannot see the event are not', async () => {
        const hostSocket = await connect(app, host);
        const strangerSocket = await connect(app, stranger);
        sockets.push(hostSocket, strangerSocket);

        hostSocket.emit('watchEvent', { eventId });
        const rejected = nextEvent<{ code: number }>(strangerSocket, 'error');
        strangerSocket.emit('watchEvent', { eventId });
        expect((await rejected).code).toBe(403);

        const changed = nextEvent<{ eventId: number }>(hostSocket, 'eventChanged');
        let strangerNotified = false;
        strangerSocket.on('eventChanged', () => (strangerNotified = true));
        await sleep(200);

        const joined = await http(app, 'POST', `/events/${eventId}/join`, { bearer: guest.token, body: {} });
        expect(joined.status).toBeLessThan(300);

        expect((await changed).eventId).toBe(eventId);
        await sleep(200);
        expect(strangerNotified).toBe(false);
    }, 20_000);
});
