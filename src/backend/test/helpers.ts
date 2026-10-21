import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { PGlite } from '@electric-sql/pglite';
import { PrismaPGlite } from 'pglite-prisma-adapter';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PrismaClient as PrismaClientType } from '../prisma/generated/client.js';

export const TEST_AUTH_ISSUER = 'https://auth.test.invalid';
export const TEST_CLIENT_ID = 'calendar-web';
export const TEST_CLIENT_SECRET = 'test-only-client-secret-do-not-use-anywhere-else';
export const TEST_REDIRECT_URI = 'http://localhost:5173/auth/callback';

// Stand-in for Legacy Auth's signing key; its public half is served as the
// JWKS the app verifies ES256 tokens against.
const authKeys = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const AUTH_KEY_ID = 'test-auth-key';

export type MockOpUser = { authId: string; username: string; scopes?: { calendar: boolean; tracker: boolean } };

type MockGrant = { user: MockOpUser; sid: string; revoked: boolean };

/**
 * A stand-in for Legacy Auth's OpenID Provider: discovery, /authorize (signs
 * in `nextUser` without a screen), /token (code and refresh grants, rotating
 * refresh tokens and refusing a replayed one, as Legacy Auth does), the JWKS,
 * and logout tokens for back-channel tests.
 */
export const mockOp = {
    nextUser: null as MockOpUser | null,
    /** Set to make /authorize answer with this error instead of a code. */
    nextError: null as { error: string; error_description?: string } | null,
    accessTtlSeconds: 900,
    refreshCalls: 0,
    codes: new Map<string, { grant: MockGrant; nonce: string; challenge: string; redirectUri: string }>(),
    refreshTokens: new Map<string, { grant: MockGrant; used: boolean }>(),
    lastAuthorize: null as URLSearchParams | null,

    /** Ends every grant of a user, as signing out at Legacy Auth does. */
    revokeUser(authId: string) {
        for (const entry of this.refreshTokens.values()) {
            if (entry.grant.user.authId === authId) entry.grant.revoked = true;
        }
    },

    sidOf(authId: string): string | undefined {
        for (const entry of this.refreshTokens.values()) {
            if (entry.grant.user.authId === authId && !entry.grant.revoked) return entry.grant.sid;
        }
        return undefined;
    },

    signLogoutToken(claims: Record<string, unknown>, options: { typ?: string } = {}): string {
        return jwt.sign(
            {
                iss: TEST_AUTH_ISSUER,
                aud: TEST_CLIENT_ID,
                jti: randomBytes(8).toString('hex'),
                events: { 'http://schemas.openid.net/event/backchannel-logout': {} },
                ...claims
            },
            authKeys.privateKey,
            {
                algorithm: 'ES256',
                keyid: AUTH_KEY_ID,
                header: { alg: 'ES256', kid: AUTH_KEY_ID, typ: options.typ ?? 'logout+jwt' }
            }
        );
    }
};

function issueTokens(grant: MockGrant, nonce: string | null) {
    const { user, sid } = grant;
    const scopes = user.scopes ?? { calendar: true, tracker: false };
    const accessToken = jwt.sign(
        {
            iss: TEST_AUTH_ISSUER,
            aud: 'calendar',
            sub: user.authId,
            client_id: TEST_CLIENT_ID,
            scope: scopes.calendar ? 'calendar.read calendar.write' : '',
            sid,
            jti: randomBytes(8).toString('hex'),
            type: 'access',
            username: user.username,
            role: 'user',
            scopes
        },
        authKeys.privateKey,
        {
            algorithm: 'ES256',
            keyid: AUTH_KEY_ID,
            expiresIn: mockOp.accessTtlSeconds,
            header: { alg: 'ES256', kid: AUTH_KEY_ID, typ: 'at+jwt' }
        }
    );
    const idToken = jwt.sign(
        {
            iss: TEST_AUTH_ISSUER,
            aud: TEST_CLIENT_ID,
            sub: user.authId,
            sid,
            auth_time: Math.floor(Date.now() / 1000),
            ...(nonce ? { nonce } : {})
        },
        authKeys.privateKey,
        { algorithm: 'ES256', keyid: AUTH_KEY_ID, expiresIn: 600 }
    );
    const refreshToken = randomBytes(24).toString('base64url');
    mockOp.refreshTokens.set(refreshToken, { grant, used: false });
    return {
        access_token: accessToken,
        id_token: idToken,
        refresh_token: refreshToken,
        token_type: 'Bearer',
        expires_in: mockOp.accessTtlSeconds,
        scope: 'openid profile calendar.read calendar.write offline_access'
    };
}

const oauthError = (error: string, status = 400) =>
    Response.json({ error }, { status, headers: { 'cache-control': 'no-store' } });

async function handleToken(request: Request): Promise<Response> {
    // client_secret_basic: each part is form-urlencoded before base64 (RFC 6749 §2.3.1).
    const basic = request.headers.get('authorization')?.match(/^Basic (.+)$/)?.[1];
    const [id, secret] = basic ? Buffer.from(basic, 'base64').toString('utf8').split(':').map(decodeURIComponent) : [];
    if (id !== TEST_CLIENT_ID || secret !== TEST_CLIENT_SECRET) {
        return oauthError('invalid_client', 401);
    }
    const form = new URLSearchParams(await request.text());
    if (form.get('grant_type') === 'authorization_code') {
        const code = mockOp.codes.get(form.get('code') ?? '');
        mockOp.codes.delete(form.get('code') ?? '');
        const challenge = createHash('sha256')
            .update(form.get('code_verifier') ?? '')
            .digest('base64url');
        if (!code || code.redirectUri !== form.get('redirect_uri') || code.challenge !== challenge) {
            return oauthError('invalid_grant');
        }
        return Response.json(issueTokens(code.grant, code.nonce), { headers: { 'cache-control': 'no-store' } });
    }
    if (form.get('grant_type') === 'refresh_token') {
        mockOp.refreshCalls++;
        const entry = mockOp.refreshTokens.get(form.get('refresh_token') ?? '');
        if (!entry || entry.grant.revoked) {
            return oauthError('invalid_grant');
        }
        if (entry.used) {
            // Replay: Legacy Auth revokes the whole grant.
            entry.grant.revoked = true;
            return oauthError('invalid_grant');
        }
        entry.used = true;
        return Response.json(issueTokens(entry.grant, null), { headers: { 'cache-control': 'no-store' } });
    }
    return oauthError('unsupported_grant_type');
}

// One server for the whole run: ConfigModule keeps the env it first saw, so
// every app in this process verifies against the first AUTH_JWKS_URI.
const jwksServer = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: async (request) => {
        const url = new URL(request.url);
        const base = `${url.protocol}//${url.host}`;
        if (url.pathname === '/.well-known/openid-configuration') {
            return Response.json({
                issuer: TEST_AUTH_ISSUER,
                authorization_endpoint: `${base}/authorize`,
                token_endpoint: `${base}/token`,
                jwks_uri: `${base}/.well-known/jwks.json`,
                end_session_endpoint: `${base}/logout`,
                response_types_supported: ['code'],
                code_challenge_methods_supported: ['S256'],
                id_token_signing_alg_values_supported: ['ES256'],
                token_endpoint_auth_methods_supported: ['client_secret_basic'],
                authorization_response_iss_parameter_supported: true
            });
        }
        if (url.pathname === '/authorize') {
            mockOp.lastAuthorize = url.searchParams;
            const redirect = new URL(url.searchParams.get('redirect_uri')!);
            redirect.searchParams.set('state', url.searchParams.get('state') ?? '');
            redirect.searchParams.set('iss', TEST_AUTH_ISSUER);
            if (mockOp.nextError || !mockOp.nextUser) {
                const failure = mockOp.nextError ?? { error: 'login_required' };
                for (const [key, value] of Object.entries(failure)) if (value) redirect.searchParams.set(key, value);
                mockOp.nextError = null;
                return Response.redirect(redirect.toString(), 302);
            }
            const code = randomBytes(16).toString('base64url');
            mockOp.codes.set(code, {
                grant: { user: mockOp.nextUser, sid: randomBytes(8).toString('hex'), revoked: false },
                nonce: url.searchParams.get('nonce') ?? '',
                challenge: url.searchParams.get('code_challenge') ?? '',
                redirectUri: url.searchParams.get('redirect_uri') ?? ''
            });
            redirect.searchParams.set('code', code);
            return Response.redirect(redirect.toString(), 302);
        }
        if (url.pathname === '/token' && request.method === 'POST') {
            return handleToken(request);
        }
        return Response.json({
            keys: [{ ...authKeys.publicKey.export({ format: 'jwk' }), kid: AUTH_KEY_ID, alg: 'ES256', use: 'sig' }]
        });
    }
});
jwksServer.unref();

export type TestApp = {
    app: INestApplication;
    prisma: PrismaClientType;
    baseUrl: string;
    close: () => Promise<void>;
};

export type TestUser = {
    id: number;
    username: string;
    authId: string;
    token: string;
    isAdmin: boolean;
};

export type HttpResult<T = any> = {
    status: number;
    body: T;
    headers: Headers;
};

export type HttpOptions = {
    bearer?: string;
    apiToken?: string;
    /** A session cookie value; sent the way the browser app sends it (same origin). */
    session?: string;
    body?: unknown;
    form?: FormData;
    headers?: Record<string, string>;
};

/**
 * Minimal end-to-end backend harness.
 *
 * PGlite runs in-process through a Prisma driver adapter, so tests exercise the
 * real controllers, guards and Prisma queries without touching a developer's
 * database. Migrations are applied exactly as they are in production, and all
 * environment variables are set before the app module is imported.
 */
export async function startTestApp(): Promise<TestApp> {
    process.env.NODE_ENV = 'test';
    process.env.LOG_LEVEL = 'fatal';
    process.env.FRONTEND_URL = 'http://localhost:5173';
    process.env.AUTH_HOST = 'http://127.0.0.1:1';
    process.env.AUTH_ISSUER = TEST_AUTH_ISSUER;
    process.env.AUTH_JWKS_URI = new URL('/.well-known/jwks.json', jwksServer.url).toString();
    process.env.OIDC_DISCOVERY_URL = new URL('/.well-known/openid-configuration', jwksServer.url).toString();
    process.env.OIDC_CLIENT_ID = TEST_CLIENT_ID;
    process.env.OIDC_CLIENT_SECRET = TEST_CLIENT_SECRET;
    process.env.OIDC_REDIRECT_URI = TEST_REDIRECT_URI;
    process.env.SESSION_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
    // ConfigModule only validates that the key exists; the adapter ignores it.
    process.env.DATABASE_URL = 'postgresql://pglite:test@127.0.0.1:5432/pglite';

    const db = await PGlite.create();
    await applyMigrations(db);

    const [{ AppModule }, { PrismaService }, { PrismaClient }] = await Promise.all([
        import('../src/app.module.js'),
        import('../src/prisma/prisma.service.js'),
        import('../prisma/generated/client.js')
    ]);

    const prisma = new PrismaClient({ adapter: new PrismaPGlite(db) });

    const moduleRef = await Test.createTestingModule({
        imports: [AppModule]
    })
        .overrideProvider(PrismaService)
        .useValue(prisma)
        // Throttling is covered by the framework; disabling it here keeps
        // lifecycle tests (25 tokens) fast and deterministic.
        .overrideGuard(ThrottlerGuard)
        .useValue({ canActivate: () => true })
        .compile();

    const app = moduleRef.createNestApplication();
    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            transform: true
        })
    );
    await app.listen(0, '127.0.0.1');

    const baseUrl = await app.getUrl();

    return {
        app,
        prisma,
        baseUrl,
        close: async () => {
            await app.close();
            await prisma.$disconnect();
            await db.close();
        }
    };
}

function applyMigrations(db: PGlite): Promise<void> {
    const migrationsDir = join(import.meta.dir, '..', 'prisma', 'migrations');
    const directories = readdirSync(migrationsDir)
        .filter((entry) => !entry.startsWith('.') && entry !== 'migration_lock.toml')
        .sort();

    return (async () => {
        for (const directory of directories) {
            const sql = readFileSync(join(migrationsDir, directory, 'migration.sql'), 'utf8');
            await db.exec(sql);
        }
    })();
}

export async function http<T = any>(
    app: TestApp,
    method: string,
    path: string,
    options: HttpOptions = {}
): Promise<HttpResult<T>> {
    const headers = new Headers(options.headers);

    if (options.bearer) {
        headers.set('authorization', `Bearer ${options.bearer}`);
    }
    if (options.apiToken) {
        headers.set('x-api-token', options.apiToken);
    }
    if (options.session) {
        headers.set('cookie', `calendar_session=${options.session}`);
        if (!headers.has('origin')) headers.set('origin', 'http://localhost:5173');
        if (!headers.has('sec-fetch-site')) headers.set('sec-fetch-site', 'same-origin');
    }

    let body: BodyInit | undefined;
    if (options.form) {
        body = options.form;
    } else if (options.body !== undefined) {
        headers.set('content-type', 'application/json');
        body = JSON.stringify(options.body);
    }

    const response = await fetch(new URL(path, app.baseUrl), { method, headers, body });
    const text = await response.text();
    let parsed: unknown = null;
    if (text) {
        try {
            parsed = JSON.parse(text);
        } catch {
            parsed = text;
        }
    }

    return {
        status: response.status,
        body: parsed as T,
        headers: response.headers
    };
}

/** Create a local user by presenting a Legacy Auth access token. */
export async function createUser(app: TestApp, label: string, options: { admin?: boolean } = {}): Promise<TestUser> {
    const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    const username = `${label}${suffix}`.slice(0, 30);
    const authId = `auth-${username}`;
    const token = signSessionToken(authId, username);

    const profile = await http<{ id: number; username: string; isAdmin: boolean }>(app, 'POST', '/auth/profile', {
        bearer: token
    });

    if (profile.status !== 200 && profile.status !== 201) {
        throw new Error(`Could not provision test user: ${profile.status} ${JSON.stringify(profile.body)}`);
    }

    if (options.admin) {
        await app.prisma.user.update({
            where: { id: profile.body.id },
            data: { isAdmin: true }
        });
    }

    return {
        id: profile.body.id,
        username: profile.body.username,
        authId,
        token,
        isAdmin: Boolean(options.admin)
    };
}

/**
 * An access token as Legacy Auth issues it for a user with the calendar scope.
 * `claims` overrides or adds payload claims (e.g. another `aud` or `scopes`).
 */
export function signSessionToken(
    authId: string,
    username: string,
    expiresIn: SignOptions['expiresIn'] = '1h',
    claims: Record<string, unknown> = {}
): string {
    return jwt.sign(
        {
            sub: authId,
            username,
            role: 'user',
            scopes: { calendar: true, tracker: false },
            type: 'access',
            iss: TEST_AUTH_ISSUER,
            aud: ['calendar'],
            ...claims
        },
        authKeys.privateKey,
        { algorithm: 'ES256', keyid: AUTH_KEY_ID, expiresIn }
    );
}

export async function createApiToken(
    app: TestApp,
    user: TestUser,
    scope: 'read' | 'write',
    name?: string
): Promise<{ id: number; token: string; tokenHint: string }> {
    const response = await http<{ id: number; token: string; tokenHint: string }>(app, 'POST', '/api-tokens', {
        bearer: user.token,
        body: { scope, ...(name ? { name } : {}) }
    });

    if (response.status !== 201) {
        throw new Error(`Could not create API token: ${response.status} ${JSON.stringify(response.body)}`);
    }

    return response.body;
}

/** The `name=value` pairs a response sets, without attributes; an empty value means cleared. */
export function setCookies(headers: Headers): Record<string, string> {
    const cookies: Record<string, string> = {};
    for (const raw of headers.getSetCookie()) {
        const [pair] = raw.split(';');
        const index = pair.indexOf('=');
        cookies[pair.slice(0, index)] = pair.slice(index + 1);
    }
    return cookies;
}

/**
 * Signs `user` in the way a browser does: /auth/login, the provider's
 * /authorize, back to /auth/callback. Returns the session cookie value.
 */
export async function signInWithBrowser(
    app: TestApp,
    user: MockOpUser,
    returnTo?: string
): Promise<{ session: string; location: string }> {
    const start = await fetch(
        new URL(`/auth/login${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`, app.baseUrl),
        {
            redirect: 'manual'
        }
    );
    const loginCookie = setCookies(start.headers).calendar_login;
    if (start.status !== 302 || !loginCookie) {
        throw new Error(`login did not redirect: ${start.status}`);
    }
    mockOp.nextUser = user;
    const authorize = await fetch(start.headers.get('location')!, { redirect: 'manual' });
    mockOp.nextUser = null;
    const back = new URL(authorize.headers.get('location')!);
    const callback = await fetch(new URL(`/auth/callback${back.search}`, app.baseUrl), {
        redirect: 'manual',
        headers: { cookie: `calendar_login=${loginCookie}` }
    });
    const session = setCookies(callback.headers).calendar_session;
    if (callback.status !== 302 || !session) {
        throw new Error(`callback did not open a session: ${callback.status} ${await callback.text()}`);
    }
    return { session, location: callback.headers.get('location')! };
}
