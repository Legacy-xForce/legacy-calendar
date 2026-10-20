import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import jwt from 'jsonwebtoken';
import * as jwksRsa from 'jwks-rsa';
import { UsersService } from '../users/users.service.js';
import { resolveJwtSecret } from './jwt-secret.util.js';
import { resolveJwksUri } from '../config/jwks.js';

export type AuthTokenPayload = {
    sub: string;
    username?: string;
    role?: 'admin' | 'user';
    scope?: string;
};

export type AuthIdentity = {
    userId: number;
    username: string;
    isAdmin: boolean;
};

/**
 * Single identity resolution path for HTTP and Socket.IO. It owns token
 * verification (HS256 local tokens / ES256 external JWKS tokens) and the local
 * account lookup, including the passkey-specific `scope: 'calendar'` rule.
 */
@Injectable()
export class AuthIdentityService {
    private readonly jwksClient: jwksRsa.JwksClient;
    private readonly jwtSecret: string;

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
    }

    async resolveToken(token: string): Promise<AuthIdentity | null> {
        const payload = await this.verifyToken(token);
        return this.resolvePayload(payload);
    }

    async resolvePayload(payload: AuthTokenPayload): Promise<AuthIdentity | null> {
        const username = typeof payload.username === 'string' ? payload.username.trim() : '';
        if (!username) {
            return null;
        }

        // Passkey tokens use the local numeric user id as `sub` and never carry
        // an external authId, so they must be resolved by id instead of synced.
        if (payload.scope === 'calendar') {
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

    private async verifyToken(token: string): Promise<AuthTokenPayload> {
        const decoded = jwt.decode(token, { complete: true }) as {
            header?: { alg?: string };
        } | null;
        const algorithm = decoded?.header?.alg;

        if (algorithm !== 'HS256' && algorithm !== 'ES256') {
            throw new Error('Unsupported token algorithm');
        }

        const key = await this.getVerificationKey(token);
        const payload = jwt.verify(token, key, { algorithms: [algorithm] });
        if (!payload || typeof payload === 'string') {
            throw new Error('Invalid token payload');
        }

        return payload as AuthTokenPayload;
    }
}
