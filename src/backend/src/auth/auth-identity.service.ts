import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import jwt from 'jsonwebtoken';
import * as jwksRsa from 'jwks-rsa';
import { UsersService } from '../users/users.service.js';
import { resolveJwtSecret } from './jwt-secret.util.js';
import { resolveAuthIssuer, resolveJwksUri } from '../config/jwks.js';

export type AuthTokenPayload = {
    sub: string;
    username?: string;
    role?: 'admin' | 'user';
    // Set only by this server's passkey login.
    scope?: string;
    // Legacy Auth access token claims.
    type?: string;
    iss?: string;
    aud?: string | string[];
    scopes?: { calendar?: boolean; tracker?: boolean };
};

// The `aud` (and `scopes` key) Legacy Auth uses for this app.
const CALENDAR_AUDIENCE = 'calendar';

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
 * Single identity resolution path for HTTP and Socket.IO. It owns token
 * verification (HS256 local tokens / ES256 external JWKS tokens) and the local
 * account lookup. HS256 tokens are accepted only as this server's own passkey
 * tokens (`scope: 'calendar'`); ES256 tokens only when Legacy Auth issued them
 * for the calendar (see grantsCalendar).
 */
@Injectable()
export class AuthIdentityService {
    private readonly jwksClient: jwksRsa.JwksClient;
    private readonly jwtSecret: string;
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
        this.jwtSecret = resolveJwtSecret(this.configService);
        this.authIssuer = resolveAuthIssuer(this.configService);
    }

    async resolveToken(token: string): Promise<AuthIdentity | null> {
        const { payload, algorithm } = await this.verifyToken(token);
        return this.resolvePayload(payload, algorithm);
    }

    /**
     * Maps a verified token's payload to a local account. `algorithm` is the
     * one the signature was verified with; it decides which kind of token this
     * is, so claims from one kind can never be read as the other.
     */
    async resolvePayload(payload: AuthTokenPayload, algorithm: string | undefined): Promise<AuthIdentity | null> {
        const username = typeof payload.username === 'string' ? payload.username.trim() : '';
        if (!username) {
            return null;
        }

        // Passkey tokens use the local numeric user id as `sub` and never carry
        // an external authId, so they must be resolved by id instead of synced.
        if (algorithm === 'HS256') {
            if (payload.scope !== 'calendar') {
                return null;
            }

            const userId = Number(payload.sub);
            if (!Number.isInteger(userId) || userId <= 0) {
                return null;
            }

            const user = await this.usersService.findOne(userId).catch(() => null);
            if (!user) {
                return null;
            }

            return {
                userId: user.id,
                username: user.username,
                isAdmin: user.isAdmin
            };
        }

        if (algorithm !== 'ES256' || !this.grantsCalendar(payload)) {
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
     * admins toggle in the Legacy Auth console.
     */
    private grantsCalendar(payload: AuthTokenPayload): boolean {
        const audiences = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
        return (
            payload.type === 'access' &&
            payload.iss === this.authIssuer &&
            audiences.includes(CALENDAR_AUDIENCE) &&
            payload.scopes?.calendar === true
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

        if (algorithm === 'HS256') {
            return this.jwtSecret;
        }

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

    private async verifyToken(token: string): Promise<{ payload: AuthTokenPayload; algorithm: string }> {
        const algorithm = tokenAlgorithm(token);

        if (algorithm !== 'HS256' && algorithm !== 'ES256') {
            throw new Error('Unsupported token algorithm');
        }

        const key = await this.getVerificationKey(token);
        const payload = jwt.verify(token, key, { algorithms: [algorithm] });
        if (!payload || typeof payload === 'string') {
            throw new Error('Invalid token payload');
        }

        return { payload: payload as AuthTokenPayload, algorithm };
    }
}
