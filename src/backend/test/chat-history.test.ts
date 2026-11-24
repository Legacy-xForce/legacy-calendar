import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createUser, http, startTestApp, TEST_ADDRESS, type TestApp, type TestUser } from './helpers.js';

type History = {
    messages: Array<{ id: number; text: string | null }>;
    nextCursor: number | null;
};

describe('chat history pagination', () => {
    let app: TestApp;
    let host: TestUser;
    let eventId: number;

    beforeAll(async () => {
        app = await startTestApp();
        host = await createUser(app, 'chathistoryhost');
        const created = await http<{ id: number }>(app, 'POST', '/events', {
            bearer: host.token,
            body: {
                title: 'History event',
                startTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                ...TEST_ADDRESS
            }
        });
        if (created.status !== 201) {
            throw new Error(`Could not create event: ${JSON.stringify(created.body)}`);
        }
        eventId = created.body.id;

        // Three messages written in the same millisecond: ordering is by
        // (createdAt, id), so a cursor that filters only on createdAt loses rows.
        const sameTimestamp = new Date('2026-01-01T00:00:00.000Z');
        for (const text of ['first', 'second', 'third']) {
            await app.prisma.chatMessage.create({
                data: { eventId, authorId: host.id, text, createdAt: sameTimestamp }
            });
        }
    }, 120_000);

    afterAll(async () => {
        await app.close();
    });

    test('pages through every message when timestamps are identical', async () => {
        const ids: number[] = [];
        let cursor: string | undefined;

        for (let page = 0; page < 5; page++) {
            const query = cursor ? `?limit=1&cursor=${cursor}` : '?limit=1';
            const response = await http<History>(app, 'GET', `/chat/${eventId}/messages${query}`, {
                bearer: host.token
            });
            expect(response.status).toBe(200);
            ids.push(...response.body.messages.map((message) => message.id));
            if (response.body.nextCursor === null) break;
            cursor = String(response.body.nextCursor);
        }

        expect(ids.length).toBe(3);
        expect(new Set(ids).size).toBe(3);
    });
});
