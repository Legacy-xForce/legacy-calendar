import { expect, mock, test } from 'bun:test';

const batches: string[][] = [];

await mock.module('firebase-admin', () => ({
    default: {
        messaging: () => ({
            sendEachForMulticast: async ({ tokens }: { tokens: string[] }) => {
                // Mirrors firebase-admin's FCM_MAX_BATCH_SIZE validation.
                if (tokens.length > 500) {
                    throw new Error('The total number of tokens and fids must not exceed 500.');
                }
                batches.push(tokens);
                return {
                    successCount: tokens.length,
                    failureCount: 0,
                    responses: tokens.map(() => ({}))
                };
            }
        }),
        initializeApp: () => {},
        credential: { cert: () => ({}) }
    }
}));

const { NotificationsService } = await import('../src/notifications/notifications.service.js');
const { PrismaService } = await import('../src/prisma/prisma.service.js');
const { NotificationCode } = await import('../src/notifications/notification-codes.js');

test('multicast notifications are chunked to Firebase’s 500-token limit', async () => {
    const service = new NotificationsService({} as unknown as PrismaService);
    (service as unknown as { initialized: boolean }).initialized = true;

    const tokens = Array.from({ length: 1001 }, (_, index) => `device-token-${index}`);
    await service.sendMulticast(tokens, 'Title', 'Body', { type: NotificationCode.EVENT_UPDATED });

    expect(batches.length).toBe(3);
    expect(batches.reduce((total, batch) => total + batch.length, 0)).toBe(1001);
});
