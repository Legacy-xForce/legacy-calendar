import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import jwt from 'jsonwebtoken';
import { http, signSessionToken, startTestApp, TEST_AUTH_ISSUER, type TestApp } from './helpers.js';

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

    test('rejects an HS256 token, whatever it claims', async () => {
        const { authId, username } = freshIdentity('hs');
        const token = jwt.sign(
            { sub: authId, username, type: 'access', iss: TEST_AUTH_ISSUER, aud: ['calendar'], scope: 'calendar.read' },
            'any-shared-secret',
            { algorithm: 'HS256' }
        );
        expect(await profileStatus(token)).toBe(401);
    });

    test('accepts an OpenID Provider token that names its scopes in `scope`', async () => {
        const { authId, username } = freshIdentity('op');
        const token = signSessionToken(authId, username, '1h', {
            scopes: undefined,
            scope: 'openid profile calendar.read calendar.write'
        });
        expect(await profileStatus(token)).toBe(201);
    });

    test('rejects an OpenID Provider token without calendar.read', async () => {
        const { authId, username } = freshIdentity('opnoscope');
        const token = signSessionToken(authId, username, '1h', { scopes: undefined, scope: 'openid profile' });
        expect(await profileStatus(token)).toBe(401);
    });
});
