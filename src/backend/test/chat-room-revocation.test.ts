import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { io, type Socket } from 'socket.io-client';
import { createUser, http, startTestApp, TEST_ADDRESS, type TestApp, type TestUser } from './helpers.js';

type ChatMessage = { id: number; text: string | null };

function connect(baseUrl: string, token: string): Promise<Socket> {
    return new Promise((resolve, reject) => {
        const socket = io(baseUrl, {
            transports: ['websocket'],
            reconnection: false,
            forceNew: true,
            timeout: 5_000,
            auth: { token }
        });
        const timer = setTimeout(() => reject(new Error('socket connection timed out')), 6_000);
        socket.once('connect', () => {
            clearTimeout(timer);
            resolve(socket);
        });
        socket.once('connect_error', (error: Error) => {
            clearTimeout(timer);
            reject(error);
        });
    });
}

function nextEvent<T>(socket: Socket, name: string, timeout = 3_000): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            socket.off(name, handler);
            reject(new Error(`Timed out waiting for ${name}`));
        }, timeout);
        const handler = (payload: T) => {
            clearTimeout(timer);
            resolve(payload);
        };
        socket.once(name, handler);
    });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('chat room access revocation', () => {
    let app: TestApp;
    let host: TestUser;
    let participant: TestUser;
    let eventId: number;
    const sockets: Socket[] = [];

    beforeAll(async () => {
        app = await startTestApp();
        host = await createUser(app, 'revocationhost');
        participant = await createUser(app, 'revokedparticipant');

        const created = await http<{ id: number }>(app, 'POST', '/events', {
            bearer: host.token,
            body: {
                title: 'Revocation event',
                startTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                participants: [participant.id],
                ...TEST_ADDRESS
            }
        });
        if (created.status !== 201) {
            throw new Error(`Could not create event: ${JSON.stringify(created.body)}`);
        }
        eventId = created.body.id;

        const joined = await http(app, 'POST', `/events/${eventId}/join`, {
            bearer: participant.token,
            body: {}
        });
        if (joined.status >= 400) {
            throw new Error(`Could not join event: ${JSON.stringify(joined.body)}`);
        }

        const hostSocket = await connect(app.baseUrl, host.token);
        const participantSocket = await connect(app.baseUrl, participant.token);
        sockets.push(hostSocket, participantSocket);
        hostSocket.emit('joinRoom', { eventId });
        participantSocket.emit('joinRoom', { eventId });
        await sleep(300);
    }, 120_000);

    afterAll(async () => {
        for (const socket of sockets) socket.close();
        await app.close();
    });

    test('a removed participant stops receiving chat messages', async () => {
        const hostSocket = sockets[0]!;
        const participantSocket = sockets[1]!;

        // Baseline: the participant can receive messages while still a member.
        const before = nextEvent<ChatMessage>(participantSocket, 'newMessage');
        hostSocket.emit('sendMessage', { eventId, text: 'while a participant' });
        expect((await before).text).toBe('while a participant');

        const removed = await http(app, 'PATCH', `/events/${eventId}`, {
            bearer: host.token,
            body: { participants: [] }
        });
        expect(removed.status).toBe(200);
        await sleep(300);

        let received = false;
        const listener = () => {
            received = true;
        };
        participantSocket.on('newMessage', listener);
        hostSocket.emit('sendMessage', { eventId, text: 'after removal' });
        await sleep(500);
        participantSocket.off('newMessage', listener);

        expect(received).toBe(false);
    }, 20_000);
});
