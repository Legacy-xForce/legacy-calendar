import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import jwt from 'jsonwebtoken';
import { createUser, http, signSessionToken, startTestApp, type TestApp } from './helpers.js';

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

    test('accepts a token from the OpenID Provider that only carries the scope string', async () => {
        const { authId, username } = freshIdentity('oidc');
        const token = signSessionToken(authId, username, '1h', {
            aud: 'calendar',
            scope: 'calendar.read calendar.write',
            scopes: undefined
        });
        expect(await profileStatus(token)).toBe(201);
    });

    test('rejects a scope string without calendar.read', async () => {
        const { authId, username } = freshIdentity('trscope');
        const token = signSessionToken(authId, username, '1h', { scope: 'tracker.read', scopes: undefined });
        expect(await profileStatus(token)).toBe(401);
    });

    test('rejects HS256 tokens, including the retired calendar passkey tokens', async () => {
        const user = await createUser(app, 'pk');
        const secret = 'any-secret-the-server-might-once-have-used';
        const passkeyToken = jwt.sign({ sub: String(user.id), username: user.username, scope: 'calendar' }, secret, {
            algorithm: 'HS256',
            expiresIn: '1h'
        });
        expect(await profileStatus(passkeyToken)).toBe(401);
        const refreshShaped = jwt.sign({ sub: user.authId, username: user.username, type: 'refresh' }, secret, {
            algorithm: 'HS256'
        });
        expect(await profileStatus(refreshShaped)).toBe(401);
    });

    test('the calendar passkey endpoints are gone', async () => {
        const user = await createUser(app, 'gone');
        expect((await http(app, 'POST', '/auth/passkey/login-options', { body: {} })).status).toBe(404);
        expect((await http(app, 'GET', '/auth/passkey/credentials', { bearer: user.token })).status).toBe(404);
        expect((await http(app, 'POST', '/auth/change-password', { bearer: user.token, body: {} })).status).toBe(404);
    });
});
