import { Inject, Injectable, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { AppLogger } from '../../logging/app-logger.js';
import { getSessionEncryptionKey } from '../../config/oidc.js';
import type { Session } from '../../../prisma/generated/client.js';
import { OidcClientService, OidcGrantError, type OidcTokens } from './oidc-client.service.js';
import { decryptToken, encryptToken } from './token-crypto.js';
import { AuthIdentityService, type AuthIdentity } from '../auth-identity.service.js';
import { SESSION_IDLE_MS, SESSION_TTL_MS, hashCookieValue, newCookieValue } from './session-cookies.js';

/** Refresh this long before the access token expires, so a request never carries a dying token. */
const REFRESH_MARGIN_MS = 60_000;
/** `lastSeenAt` is written at most this often per session. */
const TOUCH_INTERVAL_MS = 60_000;
const PRUNE_INTERVAL_MS = 60 * 60 * 1000;

export type ActiveSession = {
    id: string;
    userId: number;
    authSub: string;
    sid: string | null;
    accessToken: string;
};

type RevokedListener = (sessionIds: string[]) => void;

/**
 * Server-side sessions for the browser (the BFF half of OIDC). The browser
 * holds an opaque cookie; this service keeps Legacy Auth's tokens, encrypted,
 * and refreshes them. Legacy Auth rotates refresh tokens with no grace window
 * and revokes the whole grant when an old one is replayed, so refreshes of one
 * session are serialised: in this process by a shared promise, across
 * processes by a compare-and-swap on the stored refresh token.
 */
@Injectable()
export class SessionService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new AppLogger(SessionService.name);
    private readonly refreshing = new Map<string, Promise<Session | null>>();
    private readonly revokedListeners = new Set<RevokedListener>();
    private pruneTimer: ReturnType<typeof setInterval> | null = null;
    private key: Buffer | null = null;

    constructor(
        @Inject(PrismaService) private readonly prisma: PrismaService,
        @Inject(OidcClientService) private readonly oidcClient: OidcClientService,
        @Inject(AuthIdentityService) private readonly identityService: AuthIdentityService
    ) {}

    onModuleInit() {
        this.key = getSessionEncryptionKey();
        this.pruneTimer = setInterval(() => void this.prune(), PRUNE_INTERVAL_MS);
        this.pruneTimer.unref?.();
    }

    onModuleDestroy() {
        if (this.pruneTimer) clearInterval(this.pruneTimer);
    }

    /** Called with the ids of sessions that ended, so live sockets can be dropped. */
    onRevoked(listener: RevokedListener): () => void {
        this.revokedListeners.add(listener);
        return () => this.revokedListeners.delete(listener);
    }

    /** Stores a new session and returns the cookie value for it. */
    async create(params: { userId: number; authSub: string; sid: string | null; tokens: OidcTokens }): Promise<string> {
        const { tokens } = params;
        if (!tokens.refreshToken || !tokens.idToken) {
            throw new Error('The provider did not return a refresh token and an ID token');
        }
        const cookieValue = newCookieValue();
        const now = Date.now();
        await this.prisma.session.create({
            data: {
                id: hashCookieValue(cookieValue),
                userId: params.userId,
                authSub: params.authSub,
                sid: params.sid,
                accessToken: this.encrypt(tokens.accessToken),
                refreshToken: this.encrypt(tokens.refreshToken),
                idToken: this.encrypt(tokens.idToken),
                accessExpiresAt: new Date(now + tokens.expiresIn * 1000),
                expiresAt: new Date(now + SESSION_TTL_MS)
            }
        });
        return cookieValue;
    }

    /**
     * The live session for a cookie value, with an access token good for at
     * least a minute, or null when there is none (unknown, expired, or ended
     * at Legacy Auth).
     */
    async resolve(cookieValue: string): Promise<ActiveSession | null> {
        const id = hashCookieValue(cookieValue);
        let session = await this.prisma.session.findUnique({ where: { id } });
        if (!session) {
            return null;
        }

        const now = Date.now();
        if (session.expiresAt.getTime() <= now || session.lastSeenAt.getTime() + SESSION_IDLE_MS <= now) {
            await this.delete(id);
            return null;
        }

        if (session.accessExpiresAt.getTime() - REFRESH_MARGIN_MS <= now) {
            session = await this.refreshOnce(session);
            if (!session) {
                return null;
            }
        }

        if (now - session.lastSeenAt.getTime() >= TOUCH_INTERVAL_MS) {
            await this.prisma.session.updateMany({ where: { id }, data: { lastSeenAt: new Date(now) } });
        }

        return {
            id,
            userId: session.userId,
            authSub: session.authSub,
            sid: session.sid,
            accessToken: this.decrypt(session.accessToken)
        };
    }

    /**
     * The local account behind a session cookie. The access token goes through
     * the same checks as a Bearer token (issuer, audience, calendar scope), so a
     * session can never grant more than the token it holds.
     */
    async authenticate(cookieValue: string): Promise<{ identity: AuthIdentity; sessionId: string } | null> {
        const session = await this.resolve(cookieValue);
        if (!session) {
            return null;
        }
        const identity = await this.identityService.resolveToken(session.accessToken).catch(() => null);
        if (!identity || identity.userId !== session.userId) {
            await this.delete(session.id);
            return null;
        }
        return { identity, sessionId: session.id };
    }

    /** The ID token, for `id_token_hint` at logout. */
    async idTokenFor(cookieValue: string): Promise<{ id: string; idToken: string } | null> {
        const id = hashCookieValue(cookieValue);
        const session = await this.prisma.session.findUnique({ where: { id }, select: { idToken: true } });
        return session ? { id, idToken: this.decrypt(session.idToken) } : null;
    }

    async delete(id: string): Promise<void> {
        const { count } = await this.prisma.session.deleteMany({ where: { id } });
        if (count > 0) this.notifyRevoked([id]);
    }

    /** Ends the sessions Legacy Auth names in a back-channel logout. Returns how many ended. */
    async revokeByProviderSession(params: { sid?: string; sub?: string }): Promise<number> {
        if (!params.sid && !params.sub) {
            return 0;
        }
        // `sid` names one sign-on session; without it the logout covers every session of the user.
        const where = params.sid
            ? { sid: params.sid, ...(params.sub ? { authSub: params.sub } : {}) }
            : { authSub: params.sub };
        const sessions = await this.prisma.session.findMany({ where, select: { id: true } });
        if (sessions.length === 0) {
            return 0;
        }
        const ids = sessions.map((session) => session.id);
        await this.prisma.session.deleteMany({ where: { id: { in: ids } } });
        this.notifyRevoked(ids);
        return ids.length;
    }

    private refreshOnce(session: Session): Promise<Session | null> {
        let pending = this.refreshing.get(session.id);
        if (!pending) {
            pending = this.refresh(session).finally(() => this.refreshing.delete(session.id));
            this.refreshing.set(session.id, pending);
        }
        return pending;
    }

    private async refresh(stale: Session): Promise<Session | null> {
        let tokens: OidcTokens;
        try {
            tokens = await this.oidcClient.refresh(this.decrypt(stale.refreshToken));
        } catch (error) {
            if (error instanceof OidcGrantError) {
                // invalid_grant: signed out, disabled, or no longer allowed the calendar.
                this.logger.info('Session ended by the provider', { error: error.error });
                await this.delete(stale.id);
                return null;
            }
            // Legacy Auth is unreachable. A token that has not quite expired still works.
            if (stale.accessExpiresAt.getTime() > Date.now()) {
                this.logger.warn('Token refresh failed; using the current token until it expires', error);
                return stale;
            }
            this.logger.error('Token refresh failed', error);
            throw new ServiceUnavailableException('The sign-in service is unavailable');
        }

        // Compare-and-swap: if the session ended meanwhile (logout) or another process
        // refreshed it, nothing is written, and whatever is stored now wins.
        await this.prisma.session.updateMany({
            where: { id: stale.id, refreshToken: stale.refreshToken },
            data: {
                accessToken: this.encrypt(tokens.accessToken),
                accessExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
                ...(tokens.refreshToken ? { refreshToken: this.encrypt(tokens.refreshToken) } : {}),
                ...(tokens.idToken ? { idToken: this.encrypt(tokens.idToken) } : {})
            }
        });
        return this.prisma.session.findUnique({ where: { id: stale.id } });
    }

    private async prune() {
        try {
            const now = new Date();
            await this.prisma.session.deleteMany({
                where: {
                    OR: [
                        { expiresAt: { lte: now } },
                        { lastSeenAt: { lte: new Date(now.getTime() - SESSION_IDLE_MS) } }
                    ]
                }
            });
            await this.prisma.oidcLoginAttempt.deleteMany({ where: { expiresAt: { lte: now } } });
        } catch (error) {
            this.logger.warn('Pruning expired sessions failed', error);
        }
    }

    private notifyRevoked(ids: string[]) {
        for (const listener of this.revokedListeners) {
            try {
                listener(ids);
            } catch (error) {
                this.logger.warn('Session revocation listener failed', error);
            }
        }
    }

    private encrypt(token: string) {
        return encryptToken(token, this.encryptionKey());
    }

    private decrypt(stored: string) {
        return decryptToken(stored, this.encryptionKey());
    }

    private encryptionKey(): Buffer {
        this.key ??= getSessionEncryptionKey();
        return this.key;
    }
}
