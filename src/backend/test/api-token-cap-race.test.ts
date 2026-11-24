import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { BadRequestException } from '@nestjs/common';
import { createUser, startTestApp, type TestApp, type TestUser } from './helpers.js';
import { MAX_API_TOKENS_PER_USER } from '../src/api-tokens/api-token.constants.js';
import { ApiTokensService } from '../src/api-tokens/api-tokens.service.js';
import type { ApiTokensRepository } from '../src/api-tokens/api-tokens.repository.js';

describe('API token cap database guarantee', () => {
    let app: TestApp;
    let owner: TestUser;

    beforeAll(async () => {
        app = await startTestApp();
        owner = await createUser(app, 'capraceowner');
    }, 120_000);

    afterAll(async () => {
        await app.close();
    });

    test('the database rejects inserts beyond the per-user cap', async () => {
        for (let index = 0; index < MAX_API_TOKENS_PER_USER; index++) {
            await app.prisma.apiToken.create({
                data: {
                    userId: owner.id,
                    name: `Token ${index}`,
                    scope: 'read',
                    tokenHash: `cap-test-${owner.id}-${index}`,
                    tokenHint: 'legacy-calendar-****'
                }
            });
        }

        let rejected = false;
        try {
            await app.prisma.apiToken.create({
                data: {
                    userId: owner.id,
                    name: 'Over the cap',
                    scope: 'read',
                    tokenHash: `cap-test-${owner.id}-over`,
                    tokenHint: 'legacy-calendar-****'
                }
            });
        } catch {
            rejected = true;
        }

        expect(rejected).toBe(true);
    }, 60_000);

    test('a database limit violation becomes a 400 rather than a 500', async () => {
        const repo = {
            countForUser: () => Promise.resolve(0),
            create: () => Promise.reject(new Error('API token limit exceeded'))
        } as unknown as ApiTokensRepository;
        const service = new ApiTokensService(repo);

        let thrown: unknown;
        try {
            await service.create(owner.id, { scope: 'read' });
        } catch (error) {
            thrown = error;
        }
        expect(thrown).toBeInstanceOf(BadRequestException);
    });
});
