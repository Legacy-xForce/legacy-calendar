import { expect, test } from 'bun:test';
import { EventEmitter } from 'node:events';
import type { Socket } from 'socket.io';
import { EventsGateway } from '../src/events/events.gateway.js';
import type { EventsRepository } from '../src/events/events.repository.js';
import { EventsRealtime } from '../src/events/events-realtime.service.js';
import { ChatGateway } from '../src/chat/chat.gateway.js';
import type { ChatService } from '../src/chat/chat.service.js';
import type { AuthIdentityService } from '../src/auth/auth-identity.service.js';
import type { ApiTokensService } from '../src/api-tokens/api-tokens.service.js';

function fakeSocket(userId = 1) {
    const socket = new EventEmitter() as EventEmitter & {
        id: string;
        data: { user?: { userId: number } };
        join: () => Promise<void>;
        emitted: Array<{ event: string; payload: unknown }>;
    };
    socket.id = 'fake-socket';
    socket.data = { user: { userId } };
    socket.join = () => Promise.resolve();
    socket.emitted = [];
    socket.on('error', () => {});
    socket.emit = ((event: string, payload: unknown) => {
        socket.emitted.push({ event, payload });
        return true;
    }) as typeof socket.emit;
    return socket;
}

test('watchEvent reports a repository failure as a socket error', async () => {
    const socket = fakeSocket();
    const repo = { findOne: () => Promise.reject(new Error('database unavailable')) } as unknown as EventsRepository;
    const gateway = new EventsGateway(repo, new EventsRealtime());

    let threw = false;
    try {
        await gateway.handleWatch(socket as unknown as Socket, 5);
    } catch {
        threw = true;
    }

    expect(threw).toBe(false);
    expect(socket.emitted.some((entry) => entry.event === 'error')).toBe(true);
});

test('joinRoom reports a participation-check failure as a socket error', async () => {
    const socket = fakeSocket();
    const chatService = {
        isParticipant: () => Promise.reject(new Error('database unavailable'))
    } as unknown as ChatService;
    const gateway = new ChatGateway(
        chatService,
        {} as AuthIdentityService,
        {} as ApiTokensService,
        new EventsRealtime()
    );

    let threw = false;
    try {
        await gateway.handleJoinRoom(socket as unknown as Socket, 5);
    } catch {
        threw = true;
    }

    expect(threw).toBe(false);
    expect(socket.emitted.some((entry) => entry.event === 'error')).toBe(true);
});
