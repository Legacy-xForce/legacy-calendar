import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { PGlite } from '@electric-sql/pglite';
import { PrismaPGlite } from 'pglite-prisma-adapter';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { generateKeyPairSync } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PrismaClient as PrismaClientType } from '../prisma/generated/client.js';

export const TEST_AUTH_ISSUER = 'https://auth.test.invalid';

// Stand-in for Legacy Auth's signing key; its public half is served as the
// JWKS the app verifies ES256 tokens against.
const authKeys = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const AUTH_KEY_ID = 'test-auth-key';

// One server for the whole run: ConfigModule keeps the env it first saw, so
// every app in this process verifies against the first AUTH_JWKS_URI.
const jwksServer = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch: () =>
        Response.json({
            keys: [{ ...authKeys.publicKey.export({ format: 'jwk' }), kid: AUTH_KEY_ID, alg: 'ES256', use: 'sig' }]
        })
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
