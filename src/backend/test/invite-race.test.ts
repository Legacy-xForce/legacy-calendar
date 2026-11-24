import { expect, test } from 'bun:test';
import { EventsRepository } from '../src/events/events.repository.js';
import type { PrismaService } from '../src/prisma/prisma.service.js';
import { Prisma } from '../prisma/generated/client.js';

test('an invite racing another invite is handled atomically', async () => {
    const prisma = {
        user: { findUnique: () => Promise.resolve({ id: 7, username: 'racer' }) },
        attendance: {
            findUnique: () => Promise.resolve(null),
            create: () =>
                Promise.reject(
                    new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
                        code: 'P2002',
                        clientVersion: 'test'
                    })
                ),
            upsert: () => Promise.resolve({})
        }
    } as unknown as PrismaService;
    const repository = new EventsRepository(prisma);

    const invited = await repository.inviteUser(1, 'racer');

    expect(invited?.id).toBe(7);
});
