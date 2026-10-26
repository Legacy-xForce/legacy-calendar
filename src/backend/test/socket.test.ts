import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { io, type Socket } from 'socket.io-client';
import {
    createApiToken,
    createUser,
    http,
    signSessionToken,
    startTestApp,
    TEST_ADDRESS,
    type TestApp,
    type TestUser
} from './helpers.js';

type ChatMessage = {
    id: number;
    eventId: number;
    authorId: number;
    authorUsername: string;
    text: string | null;
    isPinned: boolean;
    isEdited: boolean;
    updatedAt: string;
    reactions: Array<{ emoji: string; count: number; userIds: number[] }>;
};

type SocketAuth = {
    token?: string;
    apiToken?: string;
};

type HandshakeError = Error & { data?: { code?: number } };

function futureDate(hours: number): Date {
    return new Date(Date.now() + hours * 60 * 60 * 1000);
}

function tryConnect(
    app: TestApp,
    auth?: SocketAuth,
    extraHeaders?: Record<string, string>
): Promise<{
    socket: Socket;
    error?: HandshakeError;
}> {
    return new Promise((resolve) => {
        const socket = io(app.baseUrl, {
            transports: ['websocket'],
            reconnection: false,
            forceNew: true,
            timeout: 5_000,
            auth,
            extraHeaders
        });
        const timer = setTimeout(() => {
            resolve({ socket, error: new Error('Socket connection timed out') });
        }, 6_000);

        socket.once('connect', () => {
            clearTimeout(timer);
            resolve({ socket });
        });
        socket.once('connect_error', (error: HandshakeError) => {
            clearTimeout(timer);
            resolve({ socket, error });
        });
    });
}

async function connect(app: TestApp, auth?: SocketAuth, extraHeaders?: Record<string, string>): Promise<Socket> {
    const result = await tryConnect(app, auth, extraHeaders);
    if (result.error) {
        result.socket.close();
        throw result.error;
    }
    return result.socket;
}

function nextEvent<T>(socket: Socket, eventName: string, timeout = 5_000): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            socket.off(eventName, handler);
            reject(new Error(`Timed out waiting for socket event ${eventName}`));
        }, timeout);

        const handler = (payload: T) => {
            clearTimeout(timer);
            resolve(payload);
        };

        socket.once(eventName, handler);
    });
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('Socket.IO API token authentication', () => {
    let app: TestApp;
    let host: TestUser;
    let readToken: string;
    let writeToken: string;
    let eventId: number;
    const sockets: Socket[] = [];

    beforeAll(async () => {
        app = await startTestApp();
        host = await createUser(app, 'sockethost');
        readToken = (await createApiToken(app, host, 'read', 'Socket read')).token;
        writeToken = (await createApiToken(app, host, 'write', 'Socket write')).token;

        const created = await http<{ id: number }>(app, 'POST', '/events', {
            apiToken: writeToken,
            body: { title: 'Socket event', startTime: futureDate(24).toISOString(), ...TEST_ADDRESS }
        });
        if (created.status !== 201) {
            throw new Error(`Could not create socket test event: ${JSON.stringify(created.body)}`);
        }
        eventId = created.body.id;
    }, 120_000);

    afterAll(async () => {
        for (const socket of sockets) {
            socket.close();
        }
        await app.close();
    });

    test('rejects missing, unknown and malformed handshake credentials', async () => {
        const missing = await tryConnect(app);
        expect(missing.error).toBeDefined();
        expect(missing.error?.data?.code).toBe(401);
        missing.socket.close();

        const unknown = await tryConnect(app, {
            apiToken: 'legacy-calendar-00000000-0000-4000-8000-000000000000'
        });
        expect(unknown.error).toBeDefined();
        expect(unknown.error?.data?.code).toBe(401);
        unknown.socket.close();

        const malformed = await tryConnect(app, { token: 'not-a-token' });
        expect(malformed.error).toBeDefined();
        expect(malformed.error?.data?.code).toBe(401);
        malformed.socket.close();

        const expired = signSessionToken(`expired-${Date.now()}`, `expired${Date.now().toString(36)}`, -10);
        const expiredSocket = await tryConnect(app, { token: expired });
        expect(expiredSocket.error).toBeDefined();
        expect(expiredSocket.error?.data?.code).toBe(401);
        expiredSocket.socket.close();
    }, 20_000);

    test('accepts read tokens on auth.apiToken, raw auth.token and the header', async () => {
        const authSocket = await connect(app, { apiToken: readToken });
        sockets.push(authSocket);

        const tokenSocket = await connect(app, { token: readToken });
        sockets.push(tokenSocket);

        const headerSocket = await connect(app, undefined, { 'x-api-token': readToken });
        sockets.push(headerSocket);

        for (const socket of [authSocket, tokenSocket, headerSocket]) {
            socket.emit('joinRoom', { eventId });
        }
        await sleep(200);

        const writeSocket = await connect(app, { apiToken: writeToken });
        sockets.push(writeSocket);
        writeSocket.emit('joinRoom', { eventId });
        await sleep(100);

        const received = [
            nextEvent<ChatMessage>(authSocket, 'newMessage'),
            nextEvent<ChatMessage>(tokenSocket, 'newMessage'),
            nextEvent<ChatMessage>(headerSocket, 'newMessage')
        ];
        writeSocket.emit('sendMessage', { eventId, text: 'readable by everyone' });

        const messages = await Promise.all(received);
        for (const message of messages) {
            expect(message.eventId).toBe(eventId);
            expect(message.authorId).toBe(host.id);
            expect(message.text).toBe('readable by everyone');
        }
    }, 20_000);

    test('blocks every write event for read-only tokens but allows room membership', async () => {
        const readSocket = await connect(app, { apiToken: readToken });
        sockets.push(readSocket);
        readSocket.emit('joinRoom', { eventId });
        await sleep(150);

        const writeSocket = await connect(app, { apiToken: writeToken });
        sockets.push(writeSocket);
        writeSocket.emit('joinRoom', { eventId });
        await sleep(100);

        const firstError = nextEvent<{ code: number; message: string }>(readSocket, 'error');
        readSocket.emit('sendMessage', { eventId, text: 'should not be written' });
        const sendError = await firstError;
        expect(sendError.code).toBe(403);
        expect(sendError.message).toContain('read-only');

        const typingError = nextEvent<{ code: number; message: string }>(readSocket, 'error');
        readSocket.emit('typing', { eventId });
        expect((await typingError).code).toBe(403);

        const stopTypingError = nextEvent<{ code: number; message: string }>(readSocket, 'error');
        readSocket.emit('stopTyping', { eventId });
        expect((await stopTypingError).code).toBe(403);

        for (const [eventName, payload] of [
            ['addReaction', { messageId: 1, emoji: '👍' }],
            ['pinMessage', { messageId: 1 }],
            ['unpinMessage', { messageId: 1 }],
            ['deleteMessage', { messageId: 1 }],
            ['editMessage', { messageId: 1, text: 'nope' }]
        ] as const) {
            const error = nextEvent<{ code: number }>(readSocket, 'error');
            readSocket.emit(eventName, payload);
            expect((await error).code).toBe(403);
        }

        const written = nextEvent<ChatMessage>(readSocket, 'newMessage');
        writeSocket.emit('sendMessage', { eventId, text: 'write token can send' });
        const message = await written;
        expect(message.text).toBe('write token can send');
    }, 20_000);

    test('supports the full chat mutation flow with a write token', async () => {
        const readSocket = await connect(app, { apiToken: readToken });
        sockets.push(readSocket);
        readSocket.emit('joinRoom', { eventId });

        const writeSocket = await connect(app, { apiToken: writeToken });
        sockets.push(writeSocket);
        writeSocket.emit('joinRoom', { eventId });
        await sleep(200);

        const newMessage = nextEvent<ChatMessage>(readSocket, 'newMessage');
        writeSocket.emit('sendMessage', { eventId, text: 'original message' });
        const message = await newMessage;
        expect(message.text).toBe('original message');

        const reactionEvent = nextEvent<{ messageId: number; reactions: Array<{ emoji: string; count: number }> }>(
            readSocket,
            'reactionUpdated'
        );
        writeSocket.emit('addReaction', { messageId: message.id, emoji: '🎉' });
        const reaction = await reactionEvent;
        expect(reaction.messageId).toBe(message.id);
        expect(reaction.reactions.some((entry) => entry.emoji === '🎉' && entry.count === 1)).toBe(true);

        const pinnedEvent = nextEvent<{ messageId: number }>(readSocket, 'messagePinned');
        writeSocket.emit('pinMessage', { messageId: message.id });
        expect((await pinnedEvent).messageId).toBe(message.id);

        const pinned = await http<ChatMessage[]>(app, 'GET', `/chat/${eventId}/pinned`, { apiToken: readToken });
        expect(pinned.status).toBe(200);
        expect(pinned.body.some((entry) => entry.id === message.id && entry.isPinned)).toBe(true);

        const editEvent = nextEvent<ChatMessage>(readSocket, 'messageEdited');
        writeSocket.emit('editMessage', { messageId: message.id, text: 'edited message' });
        const edited = await editEvent;
        expect(edited.text).toBe('edited message');
        expect(edited.isEdited).toBe(true);

        const unpinnedEvent = nextEvent<{ messageId: number }>(readSocket, 'messageUnpinned');
        writeSocket.emit('unpinMessage', { messageId: message.id });
        expect((await unpinnedEvent).messageId).toBe(message.id);

        const history = await http<{ messages: ChatMessage[] }>(app, 'GET', `/chat/${eventId}/messages`, {
            apiToken: readToken
        });
        expect(history.status).toBe(200);
        expect(history.body.messages.some((entry) => entry.id === message.id && entry.text === 'edited message')).toBe(
            true
        );

        const deletedEvent = nextEvent<{ messageId: number }>(readSocket, 'messageDeleted');
        writeSocket.emit('deleteMessage', { messageId: message.id });
        expect((await deletedEvent).messageId).toBe(message.id);

        const afterDelete = await http<{ messages: ChatMessage[] }>(app, 'GET', `/chat/${eventId}/messages`, {
            apiToken: readToken
        });
        expect(afterDelete.body.messages.some((entry) => entry.id === message.id)).toBe(false);
    }, 25_000);

    test('still accepts normal session JWTs on the socket and joins the room', async () => {
        const sessionSocket = await connect(app, { token: host.token });
        sockets.push(sessionSocket);
        sessionSocket.emit('joinRoom', { eventId });
        await sleep(150);

        const messageEvent = nextEvent<ChatMessage>(sessionSocket, 'newMessage');
        sessionSocket.emit('sendMessage', { eventId, text: 'sent with a session' });
        const message = await messageEvent;
        expect(message.authorId).toBe(host.id);
        expect(message.text).toBe('sent with a session');
    }, 20_000);
});
