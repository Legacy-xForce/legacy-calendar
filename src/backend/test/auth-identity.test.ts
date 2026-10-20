import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import jwt from 'jsonwebtoken';
import {
    createApiToken,
    createUser,
    http,
    signSessionToken,
    startTestApp,
    TEST_JWT_SECRET,
    type TestApp,
    type TestUser
} from './helpers.js';

function freshIdentity(label: string): { authId: string; username: string } {
    const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const username = `${label}${suffix}`.slice(0, 30);
    return { authId: `auth-${username}`, username };
}

describe('Legacy Auth token checks', () => {
    let app: TestApp;

    beforeAll(async () => {
        app = await startTestApp();
    }, 120_000);

    afterAll(async () => {
        await app.close();
    });

    async function profileStatus(token: string): Promise<number> {
        const response = await http(app, 'POST', '/auth/profile', { bearer: token });
        return response.status;
    }

    test('accepts a calendar access token', async () => {
        const { authId, username } = freshIdentity('ok');
        expect(await profileStatus(signSessionToken(authId, username))).toBe(201);
    });

    test('rejects an account without the calendar scope', async () => {
        const { authId, username } = freshIdentity('noscope');
        const token = signSessionToken(authId, username, '1h', { scopes: { calendar: false, tracker: true } });
        expect(await profileStatus(token)).toBe(401);
    });

    test('rejects a token issued for another app', async () => {
        const { authId, username } = freshIdentity('tracker');
        const token = signSessionToken(authId, username, '1h', { aud: ['tracker'] });
        expect(await profileStatus(token)).toBe(401);
    });

    test('rejects a token without an audience', async () => {
        const { authId, username } = freshIdentity('noaud');
        const token = signSessionToken(authId, username, '1h', { aud: undefined });
        expect(await profileStatus(token)).toBe(401);
    });

    test('rejects a token from another issuer', async () => {
        const { authId, username } = freshIdentity('iss');
        const token = signSessionToken(authId, username, '1h', { iss: 'https://elsewhere.invalid' });
        expect(await profileStatus(token)).toBe(401);
    });

    test('rejects a refresh token', async () => {
        const { authId, username } = freshIdentity('refresh');
        const token = signSessionToken(authId, username, '1h', { type: 'refresh' });
        expect(await profileStatus(token)).toBe(401);
    });

    test('rejects an HS256 token that is not a calendar passkey token', async () => {
        // Same shape as a Legacy Auth refresh token, which is also HS256.
        const { authId, username } = freshIdentity('hs');
        const token = jwt.sign({ sub: authId, username, type: 'refresh' }, TEST_JWT_SECRET, { algorithm: 'HS256' });
        expect(await profileStatus(token)).toBe(401);
    });

    test('accepts a calendar passkey token', async () => {
        const user = await createUser(app, 'pk');
        const token = jwt.sign(
            { sub: String(user.id), username: user.username, role: 'user', scope: 'calendar' },
            TEST_JWT_SECRET,
            { algorithm: 'HS256', expiresIn: '1h' }
        );
        const response = await http<{ id: number }>(app, 'POST', '/auth/profile', { bearer: token });
        expect(response.status).toBe(201);
        expect(response.body.id).toBe(user.id);
    });
});

describe('Passkey registration', () => {
    let app: TestApp;
    let alice: TestUser;
    let bob: TestUser;

    beforeAll(async () => {
        app = await startTestApp();
        alice = await createUser(app, 'alice');
        bob = await createUser(app, 'bob');
    }, 120_000);

    afterAll(async () => {
        await app.close();
    });

    async function register(user: TestUser, credentialId: string) {
        const options = await http<{ challenge: string }>(app, 'POST', '/auth/passkey/register-options', {
            bearer: user.token,
            body: {}
        });
        expect(options.status).toBe(201);
        const clientDataJSON = Buffer.from(
            JSON.stringify({ type: 'webauthn.create', challenge: options.body.challenge })
        ).toString('base64url');
        return http(app, 'POST', '/auth/passkey/register-verify', {
            bearer: user.token,
            body: {
                id: credentialId,
                rawId: credentialId,
                type: 'public-key',
                response: { clientDataJSON, publicKey: `key-of-${user.username}` }
            }
        });
    }

    test('an existing credential id cannot be moved to another account', async () => {
        const credentialId = `cred-${Date.now().toString(36)}`;
        expect((await register(alice, credentialId)).status).toBe(201);

        const takeover = await register(bob, credentialId);
        expect(takeover.status).toBe(409);

        const stored = await app.prisma.passkeyCredential.findUnique({ where: { id: credentialId } });
        expect(stored?.userId).toBe(alice.id);
        expect(stored?.publicKey).toBe(`key-of-${alice.username}`);
    });

    test('API tokens cannot register or delete passkeys', async () => {
        const writeToken = await createApiToken(app, alice, 'write');

        const options = await http(app, 'POST', '/auth/passkey/register-options', {
            apiToken: writeToken.token,
            body: {}
        });
        expect(options.status).toBe(403);

        const removal = await http(app, 'DELETE', '/auth/passkey/credentials/anything', {
            apiToken: writeToken.token
        });
        expect(removal.status).toBe(403);
    });
});
