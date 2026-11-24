import { expect, test } from 'bun:test';
import { NotificationsService } from '../src/notifications/notifications.service.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { Prisma } from '../prisma/generated/client.js';

test('concurrent chat-mute writes do not surface a unique-constraint error', async () => {
    const prisma = {
        event: {
            findUnique: () => Promise.resolve({ hostId: 1, participants: [] })
        },
        chatMute: {
            findUnique: () => Promise.resolve(null),
            create: () =>
                Promise.reject(
                    new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
                        code: 'P2002',
                        clientVersion: 'test'
                    })
                ),
            createMany: () => Promise.resolve({ count: 1 }),
            deleteMany: () => Promise.resolve({ count: 0 })
        }
    } as unknown as PrismaService;
    const service = new NotificationsService(prisma);

    expect(await service.setChatMute(1, 2, true)).toBe(true);
});
