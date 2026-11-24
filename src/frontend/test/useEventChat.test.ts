import { expect, mock, test } from 'bun:test';
import { nextTick, ref } from 'vue';

type Deferred<T> = {
    promise: Promise<T>;
    resolve: (value: T) => void;
    settled: boolean;
};

function deferred<T>(): Deferred<T> {
    let resolve: (value: T) => void = () => {};
    const promise = new Promise<T>((res) => {
        resolve = (value) => {
            request.settled = true;
            res(value);
        };
    });
    const request: Deferred<T> = { promise, resolve, settled: false };
    return request;
}

const historyRequests: Array<Deferred<{ data: { messages: unknown[]; nextCursor: number | null } }>> = [];
const sockets: Array<{ disconnected: boolean; handlers: Map<string, (payload?: unknown) => void> }> = [];

await mock.module('../src/services/API', () => ({
    default: {
        getChatHistory: () => {
            const request = deferred<{ data: { messages: unknown[]; nextCursor: number | null } }>();
            historyRequests.push(request);
            return request.promise;
        },
        getPinnedChatMessages: () => Promise.resolve({ data: [] }),
        uploadChatMedia: () => Promise.resolve({ data: {} })
    },
    socketBaseURL: 'http://localhost:3000',
    socketPath: '/socket.io'
}));

await mock.module('../src/stores/session', () => ({
    useSessionStore: () => ({
        currentUser: { id: 1, username: 'tester' },
        getAccessToken: () => Promise.resolve('token')
    })
}));

await mock.module('../src/services/logger', () => ({
    createLogger: () => ({ info: () => {}, debug: () => {}, trace: () => {}, warn: () => {}, error: () => {} })
}));

await mock.module('socket.io-client', () => ({
    io: () => {
        const handlers = new Map<string, (payload?: unknown) => void>();
        const socket = {
            disconnected: false,
            handlers,
            on: (event: string, handler: (payload?: unknown) => void) => {
                handlers.set(event, handler);
                return socket;
            },
            emit: () => true,
            connect: () => {},
            disconnect: () => {
                socket.disconnected = true;
            },
            removeAllListeners: () => handlers.clear()
        };
        sockets.push(socket);
        return socket;
    }
}));

const { useEventChat } = await import('../src/composables/useEventChat.js');

async function flush() {
    for (let index = 0; index < 5; index++) await nextTick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
}

function settlePendingHistory() {
    for (const request of historyRequests) {
        if (!request.settled) request.resolve({ data: { messages: [], nextCursor: null } });
    }
}

test('history from an abandoned event does not leak into the new event', async () => {
    const eventId = ref(1);
    const chat = useEventChat(eventId);

    eventId.value = 2;
    await flush();

    const first = historyRequests[0]!;
    const second = historyRequests[1]!;
    if (!first.settled) first.resolve({ data: { messages: [{ id: 101 }], nextCursor: null } });
    if (!second.settled) second.resolve({ data: { messages: [{ id: 202 }], nextCursor: null } });
    await flush();

    expect(chat.messages.value.map((message) => message.id)).toEqual([202]);
});

test('switching events leaves only one chat socket connected', async () => {
    const socketStart = sockets.length;
    const eventId = ref(10);
    useEventChat(eventId);
    eventId.value = 11;
    settlePendingHistory();
    await flush();
    settlePendingHistory();
    await flush();

    const createdInThisTest = sockets.slice(socketStart);
    expect(createdInThisTest.filter((socket) => !socket.disconnected).length).toBe(1);
});
