import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import jwt, { type VerifyOptions } from 'jsonwebtoken';
import * as jwksRsa from 'jwks-rsa';
import { UsersService } from '../users/users.service.js';
import { resolveAuthIssuer, resolveJwksUri } from '../config/jwks.js';

export type AuthTokenPayload = {
    sub: string;
    username?: string;
    role?: 'admin' | 'user';
    // RFC 9068 scope string of tokens from the OpenID Provider ("calendar.read calendar.write").
    scope?: string;
    // Legacy Auth access token claims.
    type?: string;
    iss?: string;
    aud?: string | string[];
    sid?: string;
    scopes?: { calendar?: boolean; tracker?: boolean };
};

// The `aud` (and `scopes` key) Legacy Auth uses for this app.
const CALENDAR_AUDIENCE = 'calendar';
// The OpenID Provider's scope for reading the calendar; every calendar grant includes it.
const CALENDAR_READ_SCOPE = 'calendar.read';

/** The `alg` from a token's header, without verifying anything. */
export function tokenAlgorithm(rawToken: string | null | undefined): string | undefined {
    if (!rawToken) {
        return undefined;
    }
    const decoded = jwt.decode(rawToken, { complete: true }) as {
        header?: { alg?: string };
    } | null;
    return decoded?.header?.alg;
}

export type AuthIdentity = {
    userId: number;
    username: string;
    isAdmin: boolean;
};

/**
 * Single identity resolution path for HTTP, Socket.IO and browser sessions. It
 * owns token verification (ES256 against Legacy Auth's JWKS) and the local
 * account lookup. A token is accepted only when Legacy Auth issued it for the
 * calendar (see grantsCalendar).
 */
@Injectable()
export class AuthIdentityService {
    private readonly jwksClient: jwksRsa.JwksClient;
    private readonly authIssuer: string;

    constructor(
        @Inject(ConfigService) private readonly configService: ConfigService,
        @Inject(UsersService) private readonly usersService: UsersService
    ) {
        this.jwksClient = new jwksRsa.JwksClient({
            cache: true,
            rateLimit: true,
            jwksRequestsPerMinute: 10,
            jwksUri: resolveJwksUri(this.configService)
        });
        this.authIssuer = resolveAuthIssuer(this.configService);
    }

    async resolveToken(token: string): Promise<AuthIdentity | null> {
        const { payload, algorithm } = await this.verifyToken(token);
        return this.resolvePayload(payload, algorithm);
    }

    /**
     * Maps a verified token's payload to a local account. `algorithm` is the
     * one the signature was verified with; only Legacy Auth's ES256 is accepted.
     */
    async resolvePayload(payload: AuthTokenPayload, algorithm: string | undefined): Promise<AuthIdentity | null> {
        const username = typeof payload.username === 'string' ? payload.username.trim() : '';
        if (!username || algorithm !== 'ES256' || !this.grantsCalendar(payload)) {
            return null;
        }

        const user = await this.usersService.syncFromAuth({
            authId: payload.sub,
            username
        });
        if (!user) {
            return null;
        }

        return {
            userId: user.id,
            username: user.username,
            isAdmin: user.isAdmin
        };
    }

    /**
     * Legacy Auth signs one key for every app, so a valid signature only proves
     * the user signed in somewhere. The token must also come from the expected
     * issuer, name the calendar in `aud`, and carry the calendar scope that
     * admins toggle in the Legacy Auth console: the legacy `scopes.calendar`
     * flag, or `calendar.read` in the OpenID Provider's `scope` string (the flag
     * is only kept there for the transition).
     */
    private grantsCalendar(payload: AuthTokenPayload): boolean {
        const audiences = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
        const scopes = typeof payload.scope === 'string' ? payload.scope.split(' ') : [];
        return (
            payload.type === 'access' &&
            payload.iss === this.authIssuer &&
            audiences.includes(CALENDAR_AUDIENCE) &&
            (payload.scopes?.calendar === true || scopes.includes(CALENDAR_READ_SCOPE))
        );
    }

    /**
     * Resolve the key used to verify a token. Passport and the gateway both call
     * this so algorithm handling and JWKS lookups cannot drift.
     */
    async getVerificationKey(rawToken: string): Promise<string | Buffer> {
        const decoded = jwt.decode(rawToken, { complete: true }) as {
            header?: { alg?: string; kid?: string };
        } | null;
        const algorithm = decoded?.header?.alg;

        if (algorithm !== 'ES256') {
            throw new Error('Unsupported token algorithm');
        }

        const kid = decoded?.header?.kid;
        if (!kid) {
            throw new Error('Missing token key id');
        }

        const signingKey = await this.jwksClient.getSigningKey(kid);
        return signingKey.getPublicKey();
    }

    /**
     * Verifies any JWT Legacy Auth signed (access, ID or logout token) and
     * returns its payload; `options` adds the claim checks the caller needs.
     */
    async verifySignedByAuth(token: string, options: VerifyOptions = {}): Promise<jwt.JwtPayload> {
        const key = await this.getVerificationKey(token);
        const payload = jwt.verify(token, key, { ...options, algorithms: ['ES256'] });
        if (!payload || typeof payload === 'string') {
            throw new Error('Invalid token payload');
        }
        return payload;
    }

    private async verifyToken(token: string): Promise<{ payload: AuthTokenPayload; algorithm: string }> {
        const payload = await this.verifySignedByAuth(token);
        return { payload: payload as AuthTokenPayload, algorithm: 'ES256' };
    }
}
