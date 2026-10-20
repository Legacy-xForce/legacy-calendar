import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { SwaggerModule } from '@nestjs/swagger';
import {
    createApiToken,
    createUser,
    http,
    signSessionToken,
    startTestApp,
    type TestApp,
    type TestUser
} from './helpers.js';
import { addApiTokenSecurity, createSwaggerConfig } from '../src/config/swagger.js';

type ApiTokenJson = {
    id: number;
    name: string;
    scope: 'read' | 'write';
    tokenHint: string;
    createdAt: string;
    lastUsedAt: string | null;
    rotatedAt: string | null;
    token?: string;
};

const TOKEN_PATTERN = /^legacy-calendar-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}

function eventRange(): { start: string; end: string } {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 14);
    return { start: start.toISOString(), end: end.toISOString() };
}

describe('API tokens', () => {
    let app: TestApp;
    let owner: TestUser;

    beforeAll(async () => {
        app = await startTestApp();
        owner = await createUser(app, 'owner');
    }, 120_000);

    afterAll(async () => {
        await app.close();
    });

    describe('creation and listing', () => {
        test('returns the plaintext token once and stores only its hash', async () => {
            const response = await http<ApiTokenJson>(app, 'POST', '/api-tokens', {
                bearer: owner.token,
                body: { name: 'Home Assistant', scope: 'read' }
            });

            expect(response.status).toBe(201);
            expect(response.body.id).toBeGreaterThan(0);
            expect(response.body.name).toBe('Home Assistant');
            expect(response.body.scope).toBe('read');
            expect(response.body.token).toMatch(TOKEN_PATTERN);
            expect(response.body.tokenHint).toBeTruthy();
            expect(response.body.tokenHint).not.toBe(response.body.token);
            expect(response.body.tokenHint.startsWith('legacy-calendar-')).toBe(true);
            expect(response.body).not.toHaveProperty('tokenHash');
            expect(response.body).not.toHaveProperty('userId');

            const rawToken = response.body.token as string;
            const stored = await app.prisma.apiToken.findUnique({ where: { id: response.body.id } });
            expect(stored).not.toBeNull();
            expect(stored?.tokenHash).toBe(hash(rawToken));
            expect(stored?.tokenHash).not.toBe(rawToken);
            expect(stored?.tokenHint).toBe(response.body.tokenHint);
            expect(stored?.lastUsedAt).toBeNull();
            expect(stored?.rotatedAt).toBeNull();

            const duplicateHash = await app.prisma.apiToken.count({ where: { tokenHash: rawToken } });
            expect(duplicateHash).toBe(0);
        });

        test('defaults and trims the name, and validates the scope', async () => {
            const unnamed = await http<ApiTokenJson>(app, 'POST', '/api-tokens', {
                bearer: owner.token,
                body: { scope: 'write' }
            });
            expect(unnamed.status).toBe(201);
            expect(unnamed.body.name).toBe('API token');

            const blank = await http<ApiTokenJson>(app, 'POST', '/api-tokens', {
                bearer: owner.token,
                body: { name: '   ', scope: 'read' }
            });
            expect(blank.status).toBe(201);
            expect(blank.body.name).toBe('API token');

            const padded = await http<ApiTokenJson>(app, 'POST', '/api-tokens', {
                bearer: owner.token,
                body: { name: '  Phone  ', scope: 'read' }
            });
            expect(padded.status).toBe(201);
            expect(padded.body.name).toBe('Phone');

            const missingScope = await http(app, 'POST', '/api-tokens', {
                bearer: owner.token,
                body: { name: 'Broken' }
            });
            expect(missingScope.status).toBe(400);

            const invalidScope = await http(app, 'POST', '/api-tokens', {
                bearer: owner.token,
                body: { scope: 'admin' }
            });
            expect(invalidScope.status).toBe(400);

            const longName = await http(app, 'POST', '/api-tokens', {
                bearer: owner.token,
                body: { name: 'x'.repeat(61), scope: 'read' }
            });
            expect(longName.status).toBe(400);
        });

        test('lists token metadata without ever exposing the secret', async () => {
            const user = await createUser(app, 'lister');
            const first = await createApiToken(app, user, 'read', 'First');
            const second = await createApiToken(app, user, 'write', 'Second');

            const response = await http<ApiTokenJson[]>(app, 'GET', '/api-tokens', { bearer: user.token });

            expect(response.status).toBe(200);
            expect(response.body).toHaveLength(2);
            expect(response.body.map((token) => token.id).sort()).toEqual([first.id, second.id].sort());
            for (const token of response.body) {
                expect(token.token).toBeUndefined();
                expect(token.tokenHint).toMatch(/^legacy-calendar-[^\s]+…[^\s]+$/);
                expect(['read', 'write']).toContain(token.scope);
            }
        });

        test('does not leak tokens between users', async () => {
            const alice = await createUser(app, 'alice');
            const bob = await createUser(app, 'bob');
            const aliceToken = await createApiToken(app, alice, 'read', 'Alice token');

            const bobList = await http<ApiTokenJson[]>(app, 'GET', '/api-tokens', { bearer: bob.token });
            expect(bobList.status).toBe(200);
            expect(bobList.body).toHaveLength(0);

            const rotate = await http(app, 'POST', `/api-tokens/${aliceToken.id}/rotate`, { bearer: bob.token });
            expect(rotate.status).toBe(404);

            const remove = await http(app, 'DELETE', `/api-tokens/${aliceToken.id}`, { bearer: bob.token });
            expect(remove.status).toBe(404);

            const aliceList = await http<ApiTokenJson[]>(app, 'GET', '/api-tokens', { bearer: alice.token });
            expect(aliceList.body.map((token) => token.id)).toEqual([aliceToken.id]);
        });

        test('enforces the per-user token cap', async () => {
            const user = await createUser(app, 'hoarder');

            for (let index = 0; index < 25; index += 1) {
                const created = await http(app, 'POST', '/api-tokens', {
                    bearer: user.token,
                    body: { name: `Token ${index}`, scope: 'read' }
                });
                expect(created.status).toBe(201);
            }

            const blocked = await http<{ message: string }>(app, 'POST', '/api-tokens', {
                bearer: user.token,
                body: { name: 'One too many', scope: 'read' }
            });
            expect(blocked.status).toBe(400);
            expect(blocked.body.message).toContain('maximum of 25 API tokens');

            const first = await app.prisma.apiToken.findFirst({ where: { userId: user.id }, orderBy: { id: 'asc' } });
            expect(first).not.toBeNull();
            const deleted = await http(app, 'DELETE', `/api-tokens/${first?.id ?? 0}`, { bearer: user.token });
            expect(deleted.status).toBe(200);

            const afterDelete = await http(app, 'POST', '/api-tokens', {
                bearer: user.token,
                body: { name: 'Replacement', scope: 'read' }
            });
            expect(afterDelete.status).toBe(201);
        });
    });

    describe('authentication', () => {
        test('authenticates read and write tokens as the owning user', async () => {
            const read = await createApiToken(app, owner, 'read', 'Reader');
            const write = await createApiToken(app, owner, 'write', 'Writer');

            const viaRead = await http<Array<{ id: number }>>(app, 'GET', '/users', { apiToken: read.token });
            expect(viaRead.status).toBe(200);
            expect(viaRead.body.some((user) => user.id === owner.id)).toBe(true);

            const viaWrite = await http<Array<{ id: number }>>(app, 'GET', '/users', { apiToken: write.token });
            expect(viaWrite.status).toBe(200);
        });

        test('rejects missing, malformed, unknown and expired credentials', async () => {
            const missing = await http(app, 'GET', '/users');
            expect(missing.status).toBe(401);

            const malformed = await http(app, 'GET', '/users', { apiToken: 'not-a-token' });
            expect(malformed.status).toBe(401);

            const unknown = await http(app, 'GET', '/users', {
                apiToken: 'legacy-calendar-00000000-0000-4000-8000-000000000000'
            });
            expect(unknown.status).toBe(401);

            const bearerTokenAsJwt = await http(app, 'GET', '/users', {
                bearer: 'legacy-calendar-00000000-0000-4000-8000-000000000000'
            });
            expect(bearerTokenAsJwt.status).toBe(401);

            const expired = signSessionToken(`expired-${Date.now()}`, `expired${Date.now().toString(36)}`, -10);
            const expiredJwt = await http(app, 'GET', '/users', { bearer: expired });
            expect(expiredJwt.status).toBe(401);

            const invalidJwt = await http(app, 'GET', '/users', { bearer: 'definitely-not-a-jwt' });
            expect(invalidJwt.status).toBe(401);
        });

        test('rejects a token immediately after its owner is deleted', async () => {
            const user = await createUser(app, 'removed');
            const token = await createApiToken(app, user, 'read', 'Soon invalid');

            const before = await http(app, 'GET', '/users', { apiToken: token.token });
            expect(before.status).toBe(200);

            await app.prisma.user.delete({ where: { id: user.id } });

            const after = await http(app, 'GET', '/users', { apiToken: token.token });
            expect(after.status).toBe(401);

            const remaining = await app.prisma.apiToken.count({ where: { id: token.id } });
            expect(remaining).toBe(0);
        });

        test('updates lastUsedAt without writing on every request', async () => {
            const user = await createUser(app, 'usage');
            const token = await createApiToken(app, user, 'read', 'Usage tracking');
            const range = eventRange();

            const stored = await app.prisma.apiToken.findUniqueOrThrow({ where: { id: token.id } });
            expect(stored.lastUsedAt).toBeNull();

            const firstUse = await http(app, 'GET', `/events?start=${range.start}&end=${range.end}`, {
                apiToken: token.token
            });
            expect(firstUse.status).toBe(200);

            const used = await app.prisma.apiToken.findUniqueOrThrow({ where: { id: token.id } });
            expect(used.lastUsedAt).toBeInstanceOf(Date);

            const old = new Date(Date.now() - 5 * 60_000);
            await app.prisma.apiToken.update({ where: { id: token.id }, data: { lastUsedAt: old } });
            await http(app, 'GET', `/events?start=${range.start}&end=${range.end}`, { apiToken: token.token });
            const refreshed = await app.prisma.apiToken.findUniqueOrThrow({ where: { id: token.id } });
            expect(refreshed.lastUsedAt?.getTime() ?? 0).toBeGreaterThan(old.getTime());

            const now = new Date();
            await app.prisma.apiToken.update({ where: { id: token.id }, data: { lastUsedAt: now } });
            await http(app, 'GET', `/events?start=${range.start}&end=${range.end}`, { apiToken: token.token });
            const throttled = await app.prisma.apiToken.findUniqueOrThrow({ where: { id: token.id } });
            expect(throttled.lastUsedAt?.getTime()).toBe(now.getTime());

            const listed = await http<ApiTokenJson[]>(app, 'GET', '/api-tokens', { bearer: user.token });
            const listedToken = listed.body.find((entry) => entry.id === token.id);
            expect(listedToken?.lastUsedAt).not.toBeNull();
        });

        test('inherits the admin role from the owner but not the credential type', async () => {
            const admin = await createUser(app, 'admin', { admin: true });
            const write = await createApiToken(app, admin, 'write', 'Admin writer');
            const read = await createApiToken(app, admin, 'read', 'Admin reader');
            const createdUsername = `created${Date.now().toString(36)}`.slice(0, 30);

            const created = await http<{ id: number; username: string }>(app, 'POST', '/users', {
                apiToken: write.token,
                body: { username: createdUsername }
            });
            expect(created.status).toBe(201);

            const listed = await http(app, 'GET', '/users', { apiToken: read.token });
            expect(listed.status).toBe(200);

            const readCannotDelete = await http(app, 'DELETE', `/users/${created.body.id}`, { apiToken: read.token });
            expect(readCannotDelete.status).toBe(403);

            const writeCanDelete = await http(app, 'DELETE', `/users/${created.body.id}`, { apiToken: write.token });
            expect(writeCanDelete.status).toBe(200);
        });
    });

    describe('scopes', () => {
        test('read tokens may only perform safe requests', async () => {
            const user = await createUser(app, 'readonly');
            const token = await createApiToken(app, user, 'read', 'Read only');
            const range = eventRange();
            const start = new Date(Date.now() + 24 * 60 * 60 * 1000);

            const get = await http(app, 'GET', `/events?start=${range.start}&end=${range.end}`, {
                apiToken: token.token
            });
            expect(get.status).toBe(200);

            const head = await http(app, 'HEAD', '/events/upcoming', { apiToken: token.token });
            expect(head.status).toBe(200);

            const profile = await http(app, 'POST', '/auth/profile', { apiToken: token.token });
            expect([200, 201]).toContain(profile.status);

            const createEvent = await http<{ message: string }>(app, 'POST', '/events', {
                apiToken: token.token,
                body: { title: 'Should fail', startTime: start.toISOString() }
            });
            expect(createEvent.status).toBe(403);
            expect(createEvent.body.message).toContain('read-only');

            const updatePayment = await http(app, 'PATCH', '/users/me/payment-info', {
                apiToken: token.token,
                body: { paypalLink: 'https://paypal.me/should-not-happen' }
            });
            expect(updatePayment.status).toBe(403);

            const createGroup = await http(app, 'POST', '/user-groups', {
                apiToken: token.token,
                body: { name: 'Nope', memberIds: [] }
            });
            expect(createGroup.status).toBe(403);

            const subscribe = await http(app, 'POST', '/notifications/subscribe', {
                apiToken: token.token,
                body: { token: 'should-not-be-stored' }
            });
            expect(subscribe.status).toBe(403);

            const changePassword = await http(app, 'POST', '/auth/change-password', {
                apiToken: token.token,
                body: { currentPassword: 'a', newPassword: 'b' }
            });
            expect(changePassword.status).toBe(403);
        });

        test('write tokens may perform every request the user can make', async () => {
            const user = await createUser(app, 'writer');
            const token = await createApiToken(app, user, 'write', 'Writer');
            const start = new Date(Date.now() + 24 * 60 * 60 * 1000);

            const createEvent = await http<{ id: number; title: string }>(app, 'POST', '/events', {
                apiToken: token.token,
                body: { title: 'Written by token', startTime: start.toISOString() }
            });
            expect(createEvent.status).toBe(201);
            expect(createEvent.body.title).toBe('Written by token');

            const updateEvent = await http<{ title: string }>(app, 'PATCH', `/events/${createEvent.body.id}`, {
                apiToken: token.token,
                body: { title: 'Updated by token' }
            });
            expect(updateEvent.status).toBe(200);
            expect(updateEvent.body.title).toBe('Updated by token');

            const payment = await http<{ paypalLink: string }>(app, 'PATCH', '/users/me/payment-info', {
                apiToken: token.token,
                body: { paypalLink: 'https://paypal.me/writer' }
            });
            expect(payment.status).toBe(200);
            expect(payment.body.paypalLink).toBe('https://paypal.me/writer');

            const group = await http<{ id: number }>(app, 'POST', '/user-groups', {
                apiToken: token.token,
                body: { name: 'Token group', memberIds: [user.id] }
            });
            expect(group.status).toBe(201);

            const removeEvent = await http(app, 'DELETE', `/events/${createEvent.body.id}`, { apiToken: token.token });
            expect(removeEvent.status).toBe(200);
        });
    });

    describe('management requires a session', () => {
        test('API tokens cannot list, create, rotate or delete tokens', async () => {
            const user = await createUser(app, 'manager');
            const write = await createApiToken(app, user, 'write', 'Write token');
            const victim = await createApiToken(app, user, 'read', 'Victim');

            const list = await http<{ message: string }>(app, 'GET', '/api-tokens', { apiToken: write.token });
            expect(list.status).toBe(403);
            expect(list.body.message).toContain('API tokens cannot manage API tokens');

            const create = await http(app, 'POST', '/api-tokens', {
                apiToken: write.token,
                body: { scope: 'write', name: 'Escalation attempt' }
            });
            expect(create.status).toBe(403);

            const rotate = await http(app, 'POST', `/api-tokens/${victim.id}/rotate`, { apiToken: write.token });
            expect(rotate.status).toBe(403);

            const remove = await http(app, 'DELETE', `/api-tokens/${victim.id}`, { apiToken: write.token });
            expect(remove.status).toBe(403);
        });
    });

    describe('rotation and deletion', () => {
        test('rotation invalidates the old value and returns the new one once', async () => {
            const user = await createUser(app, 'rotator');
            const original = await createApiToken(app, user, 'write', 'Rotating');

            const before = await http(app, 'GET', '/users', { apiToken: original.token });
            expect(before.status).toBe(200);

            const rotated = await http<ApiTokenJson>(app, 'POST', `/api-tokens/${original.id}/rotate`, {
                bearer: user.token
            });
            expect(rotated.status).toBe(200);
            expect(rotated.body.id).toBe(original.id);
            expect(rotated.body.token).toMatch(TOKEN_PATTERN);
            expect(rotated.body.token).not.toBe(original.token);
            expect(rotated.body.tokenHint).not.toBe(original.tokenHint);
            expect(rotated.body.lastUsedAt).toBeNull();
            expect(rotated.body.rotatedAt).not.toBeNull();

            const oldValue = await http(app, 'GET', '/users', { apiToken: original.token });
            expect(oldValue.status).toBe(401);

            const newValue = await http(app, 'GET', '/users', { apiToken: rotated.body.token });
            expect(newValue.status).toBe(200);

            const stored = await app.prisma.apiToken.findUniqueOrThrow({ where: { id: original.id } });
            expect(stored.tokenHash).toBe(hash(rotated.body.token as string));
            expect(stored.rotatedAt).toBeInstanceOf(Date);

            const rotateUnknown = await http(app, 'POST', '/api-tokens/999999/rotate', { bearer: user.token });
            expect(rotateUnknown.status).toBe(404);
        });

        test('deletion revokes the token immediately', async () => {
            const user = await createUser(app, 'deleter');
            const token = await createApiToken(app, user, 'read', 'To delete');

            const remove = await http<{ success: boolean }>(app, 'DELETE', `/api-tokens/${token.id}`, {
                bearer: user.token
            });
            expect(remove.status).toBe(200);
            expect(remove.body.success).toBe(true);

            const revoked = await http(app, 'GET', '/users', { apiToken: token.token });
            expect(revoked.status).toBe(401);

            const list = await http<ApiTokenJson[]>(app, 'GET', '/api-tokens', { bearer: user.token });
            expect(list.body.some((entry) => entry.id === token.id)).toBe(false);

            const removeAgain = await http(app, 'DELETE', `/api-tokens/${token.id}`, { bearer: user.token });
            expect(removeAgain.status).toBe(404);

            const stored = await app.prisma.apiToken.findUnique({ where: { id: token.id } });
            expect(stored).toBeNull();
        });
    });

    describe('OpenAPI documentation', () => {
        test('advertises both authentication schemes, except on token management', () => {
            const document = addApiTokenSecurity(SwaggerModule.createDocument(app.app, createSwaggerConfig()));
            const schemes = document.components?.securitySchemes ?? {};

            expect(schemes.bearer).toBeDefined();
            const apiTokenScheme = schemes['api-token'];
            expect(apiTokenScheme).toBeDefined();
            if (!apiTokenScheme || '$ref' in apiTokenScheme) {
                throw new Error('API token security scheme is missing or is a reference');
            }
            expect(apiTokenScheme.type).toBe('apiKey');
            expect(apiTokenScheme.in).toBe('header');
            expect(apiTokenScheme.name).toBe('X-API-Token');

            const eventsSecurity = document.paths['/events']?.get?.security ?? [];
            expect(eventsSecurity).toContainEqual({ bearer: [] });
            expect(eventsSecurity).toContainEqual({ 'api-token': [] });

            const profileSecurity = document.paths['/auth/profile']?.post?.security ?? [];
            expect(profileSecurity).toContainEqual({ 'api-token': [] });

            const tokenListSecurity = document.paths['/api-tokens']?.get?.security ?? [];
            expect(tokenListSecurity).toContainEqual({ bearer: [] });
            expect(tokenListSecurity).not.toContainEqual({ 'api-token': [] });

            const tokenDeleteSecurity = document.paths['/api-tokens/{id}']?.delete?.security ?? [];
            expect(tokenDeleteSecurity).toContainEqual({ bearer: [] });
            expect(tokenDeleteSecurity).not.toContainEqual({ 'api-token': [] });
        });

        test('documents the X-API-Token header and scopes', () => {
            const document = addApiTokenSecurity(SwaggerModule.createDocument(app.app, createSwaggerConfig()));
            const description = document.info.description ?? '';

            expect(description).toContain('X-API-Token');
            expect(description).toContain('read');
            expect(description).toContain('write');

            const methods = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head', 'trace'] as const;
            type OperationWithSecurity = { security?: Array<Record<string, unknown>> };
            type PathItemWithMethods = Partial<Record<(typeof methods)[number], OperationWithSecurity>>;

            for (const [path, pathItem] of Object.entries(document.paths)) {
                for (const method of methods) {
                    const operation = (pathItem as PathItemWithMethods)[method];
                    if (!operation?.security) {
                        continue;
                    }

                    const hasBearer = operation.security.some((requirement) => 'bearer' in requirement);
                    const hasApiToken = operation.security.some((requirement) => 'api-token' in requirement);

                    if (!hasBearer) {
                        continue;
                    }

                    if (path === '/api-tokens' || path.startsWith('/api-tokens/')) {
                        expect(hasApiToken).toBe(false);
                    } else {
                        expect(hasApiToken).toBe(true);
                    }
                }
            }
        });
    });
});
