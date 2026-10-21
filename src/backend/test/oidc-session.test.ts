import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import {
    TEST_CLIENT_ID,
    TEST_REDIRECT_URI,
    createApiToken,
    createUser,
    http,
    mockOp,
    setCookies,
    signInWithBrowser,
    signSessionToken,
    startTestApp,
    type MockOpUser,
    type TestApp
} from './helpers.js';

function freshUser(label: string, scopes = { calendar: true, tracker: false }): MockOpUser {
    const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const username = `${label}${suffix}`.slice(0, 30);
    return { authId: `auth-${username}`, username, scopes };
}

let app: TestApp;

beforeAll(async () => {
    app = await startTestApp();
}, 120_000);

afterAll(async () => {
    await app.close();
});

beforeEach(() => {
    mockOp.accessTtlSeconds = 900;
    mockOp.nextError = null;
});

const raw = (path: string, init: RequestInit = {}) =>
    fetch(new URL(path, app.baseUrl), { redirect: 'manual', ...init });

describe('signing in', () => {
    test('/auth/login sends the browser to Legacy Auth with PKCE, state, nonce and the calendar resource', async () => {
        const response = await raw('/auth/login');
        expect(response.status).toBe(302);
        const target = new URL(response.headers.get('location')!);
        expect(target.pathname).toBe('/authorize');
        const params = target.searchParams;
        expect(params.get('client_id')).toBe(TEST_CLIENT_ID);
        expect(params.get('redirect_uri')).toBe(TEST_REDIRECT_URI);
        expect(params.get('response_type')).toBe('code');
        expect(params.get('resource')).toBe('urn:legacy:calendar');
        expect(params.get('scope')?.split(' ').sort()).toEqual(
            ['calendar.read', 'calendar.write', 'offline_access', 'openid', 'profile'].sort()
        );
        expect(params.get('code_challenge_method')).toBe('S256');
        expect(params.get('code_challenge')).toMatch(/^[\w-]{43}$/);
        expect(params.get('state')).toBeTruthy();
        expect(params.get('nonce')).toBeTruthy();
        expect(params.get('prompt')).toBe('consent');

        const cookie = response.headers.getSetCookie().find((value) => value.startsWith('calendar_login='))!;
        expect(cookie).toContain('HttpOnly');
        expect(cookie).toContain('SameSite=Lax');
    });

    test('prompt=login asks Legacy Auth for a fresh sign-in', async () => {
        const response = await raw('/auth/login?prompt=login');
        expect(new URL(response.headers.get('location')!).searchParams.get('prompt')).toBe('login consent');
    });

    test('a full sign-in opens an HttpOnly session and lands on returnTo', async () => {
        const user = freshUser('signin');
        const { session, location } = await signInWithBrowser(app, user, '/event/12?tab=chat');
        expect(location).toBe('/event/12?tab=chat');

        const profile = await http<{ username: string }>(app, 'POST', '/auth/profile', { session });
        expect(profile.status).toBe(201);
        expect(profile.body.username).toBe(user.username);

        const stored = await app.prisma.session.findFirst({ where: { authSub: user.authId } });
        expect(stored).not.toBeNull();
        // Tokens are stored encrypted, never as the JWTs themselves.
        expect(stored!.accessToken.startsWith('v1.')).toBe(true);
        expect(stored!.refreshToken.startsWith('v1.')).toBe(true);
        expect(stored!.id).not.toBe(session);
    });

    test('returnTo cannot leave the site', async () => {
        for (const target of ['https://evil.example/', '//evil.example/', '/\\evil.example', '/auth/logout']) {
            const { location } = await signInWithBrowser(app, freshUser('redir'), target);
            expect(location).toBe('/calendar');
        }
    });

    test('a callback without the login cookie, or with another state, opens no session', async () => {
        const start = await raw('/auth/login');
        const loginCookie = setCookies(start.headers).calendar_login;
        mockOp.nextUser = freshUser('csrf');
        const authorize = await fetch(start.headers.get('location')!, { redirect: 'manual' });
        mockOp.nextUser = null;
        const back = new URL(authorize.headers.get('location')!);

        const noCookie = await raw(`/auth/callback${back.search}`);
        expect(noCookie.status).toBe(400);
        expect(setCookies(noCookie.headers).calendar_session).toBeUndefined();

        const tampered = new URLSearchParams(back.search);
        tampered.set('state', 'forged');
        const wrongState = await raw(`/auth/callback?${tampered}`, {
            headers: { cookie: `calendar_login=${loginCookie}` }
        });
        expect(wrongState.status).toBe(400);
        expect(setCookies(wrongState.headers).calendar_session).toBeUndefined();

        // The attempt was used up by the failed try, so the genuine response cannot be replayed either.
        const replay = await raw(`/auth/callback${back.search}`, {
            headers: { cookie: `calendar_login=${loginCookie}` }
        });
        expect(replay.status).toBe(400);
    });

    test('access_denied from Legacy Auth goes to the matching fallback page', async () => {
        const cases: [string, string][] = [
            ['The account has no access to calendar', '/insufficient-scope'],
            ['The account is not available', '/disabled']
        ];
        for (const [description, page] of cases) {
            const start = await raw('/auth/login');
            const loginCookie = setCookies(start.headers).calendar_login;
            mockOp.nextError = { error: 'access_denied', error_description: description };
            const authorize = await fetch(start.headers.get('location')!, { redirect: 'manual' });
            const back = new URL(authorize.headers.get('location')!);
            const callback = await raw(`/auth/callback${back.search}`, {
                headers: { cookie: `calendar_login=${loginCookie}` }
            });
            expect(callback.status).toBe(302);
            expect(callback.headers.get('location')).toBe(page);
        }
    });

    test('a token without the calendar scope never opens a session', async () => {
        const start = await raw('/auth/login');
        const loginCookie = setCookies(start.headers).calendar_login;
        mockOp.nextUser = freshUser('noscope', { calendar: false, tracker: true });
        const authorize = await fetch(start.headers.get('location')!, { redirect: 'manual' });
        mockOp.nextUser = null;
        const back = new URL(authorize.headers.get('location')!);
        const callback = await raw(`/auth/callback${back.search}`, {
            headers: { cookie: `calendar_login=${loginCookie}` }
        });
        expect(callback.headers.get('location')).toBe('/insufficient-scope');
        expect(setCookies(callback.headers).calendar_session).toBeUndefined();
    });
});

describe('the session', () => {
    test('authenticates API calls and refuses a cross-site write', async () => {
        const { session } = await signInWithBrowser(app, freshUser('csrfw'));
        expect((await http(app, 'GET', '/events/upcoming', { session })).status).toBe(200);

        const crossSite = await http(app, 'POST', '/auth/profile', {
            session,
            headers: { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' }
        });
        expect(crossSite.status).toBe(403);

        const noOrigin = await fetch(new URL('/auth/profile', app.baseUrl), {
            method: 'POST',
            headers: { cookie: `calendar_session=${session}` }
        });
        expect(noOrigin.status).toBe(403);
    });

    test('an unknown cookie is 401 and is cleared', async () => {
        const response = await http(app, 'POST', '/auth/profile', { session: 'not-a-session' });
        expect(response.status).toBe(401);
        expect(setCookies(response.headers).calendar_session).toBe('');
    });

    test('refreshes an expiring token once, however many requests arrive together', async () => {
        mockOp.accessTtlSeconds = 30; // inside the refresh margin, so the next request refreshes
        const { session } = await signInWithBrowser(app, freshUser('refresh'));
        mockOp.accessTtlSeconds = 900;
        const before = mockOp.refreshCalls;

        const results = await Promise.all(
            Array.from({ length: 8 }, () => http(app, 'GET', '/events/upcoming', { session }))
        );
        expect(results.map((result) => result.status)).toEqual(Array<number>(8).fill(200));
        expect(mockOp.refreshCalls - before).toBe(1);

        // The rotated refresh token was stored: the session keeps working.
        expect((await http(app, 'GET', '/events/upcoming', { session })).status).toBe(200);
    });

    test('a refresh refused by Legacy Auth ends the session', async () => {
        mockOp.accessTtlSeconds = 30;
        const user = freshUser('revoked');
        const { session } = await signInWithBrowser(app, user);
        mockOp.accessTtlSeconds = 900;
        mockOp.revokeUser(user.authId);

        expect((await http(app, 'GET', '/events/upcoming', { session })).status).toBe(401);
        expect(await app.prisma.session.count({ where: { authSub: user.authId } })).toBe(0);
    });

    test('Bearer tokens and API tokens keep working beside sessions', async () => {
        const user = await createUser(app, 'bearer');
        expect((await http(app, 'GET', '/events/upcoming', { bearer: user.token })).status).toBe(200);
        const apiToken = await createApiToken(app, user, 'read');
        expect((await http(app, 'GET', '/events/upcoming', { apiToken: apiToken.token })).status).toBe(200);
    });

    test('a session may manage API tokens', async () => {
        const { session } = await signInWithBrowser(app, freshUser('tokens'));
        const created = await http(app, 'POST', '/api-tokens', { session, body: { scope: 'read' } });
        expect(created.status).toBe(201);
    });
});

describe('signing out', () => {
    test('logout ends the session and returns Legacy Auth’s logout URL with the ID token', async () => {
        const { session } = await signInWithBrowser(app, freshUser('logout'));
        const response = await http<{ redirect: string }>(app, 'POST', '/auth/logout', { session });
        expect(response.status).toBe(200);
        const target = new URL(response.body.redirect);
        expect(target.pathname).toBe('/logout');
        expect(target.searchParams.get('id_token_hint')).toBeTruthy();
        expect(target.searchParams.get('post_logout_redirect_uri')).toBe('http://localhost:5173/');
        expect(setCookies(response.headers).calendar_session).toBe('');

        expect((await http(app, 'POST', '/auth/profile', { session })).status).toBe(401);
    });

    test('logout refuses a cross-site request', async () => {
        const { session } = await signInWithBrowser(app, freshUser('logoutx'));
        const response = await http(app, 'POST', '/auth/logout', {
            session,
            headers: { origin: 'https://evil.example', 'sec-fetch-site': 'cross-site' }
        });
        expect(response.status).toBe(403);
        expect((await http(app, 'POST', '/auth/profile', { session })).status).toBe(201);
    });

    async function backchannel(token: string) {
        return raw('/auth/backchannel-logout', {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({ logout_token: token })
        });
    }

    test('a back-channel logout for the session id ends that session', async () => {
        const user = freshUser('bcl');
        const { session } = await signInWithBrowser(app, user);
        const other = await signInWithBrowser(app, freshUser('bclother'));
        const sid = mockOp.sidOf(user.authId)!;

        const response = await backchannel(mockOp.signLogoutToken({ sid, sub: user.authId }));
        expect(response.status).toBe(204);
        expect((await http(app, 'POST', '/auth/profile', { session })).status).toBe(401);
        expect((await http(app, 'POST', '/auth/profile', { session: other.session })).status).toBe(201);
    });

    test('a back-channel logout without sid ends every session of the user', async () => {
        const user = freshUser('bclsub');
        const first = await signInWithBrowser(app, user);
        const second = await signInWithBrowser(app, user);
        expect((await backchannel(mockOp.signLogoutToken({ sub: user.authId }))).status).toBe(204);
        expect((await http(app, 'POST', '/auth/profile', { session: first.session })).status).toBe(401);
        expect((await http(app, 'POST', '/auth/profile', { session: second.session })).status).toBe(401);
    });

    test('invalid logout tokens are refused and end nothing', async () => {
        const user = freshUser('bclbad');
        const { session } = await signInWithBrowser(app, user);
        const sid = mockOp.sidOf(user.authId)!;
        const bad = [
            mockOp.signLogoutToken({ sid }, { typ: 'JWT' }),
            mockOp.signLogoutToken({ sid, aud: 'tracker-web' }),
            mockOp.signLogoutToken({ sid, iss: 'https://elsewhere.invalid' }),
            mockOp.signLogoutToken({ sid, events: {} }),
            mockOp.signLogoutToken({ sid, nonce: 'n' }),
            mockOp.signLogoutToken({ aud: TEST_CLIENT_ID }),
            signSessionToken(user.authId, user.username),
            'not-a-jwt'
        ];
        for (const token of bad) {
            expect((await backchannel(token)).status).toBe(400);
        }
        expect((await raw('/auth/backchannel-logout', { method: 'POST' })).status).toBe(400);
        expect((await http(app, 'POST', '/auth/profile', { session })).status).toBe(201);
    });
});
