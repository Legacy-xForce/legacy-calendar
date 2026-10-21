import { Inject, Injectable } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import { AppLogger } from '../../logging/app-logger.js';
import { getOidcClientId, getOidcIssuer } from '../../config/oidc.js';
import { AuthIdentityService } from '../auth-identity.service.js';

const BACKCHANNEL_LOGOUT_EVENT = 'http://schemas.openid.net/event/backchannel-logout';
/** A logout token older than this is refused (Legacy Auth delivers within seconds and retries for an hour). */
const MAX_AGE_SECONDS = 2 * 60 * 60;

export type LogoutTarget = { sid?: string; sub?: string };

/** Validates logout tokens as OpenID Connect Back-Channel Logout 1.0 §2.6 requires. */
@Injectable()
export class BackchannelLogoutService {
    private readonly logger = new AppLogger(BackchannelLogoutService.name);

    constructor(@Inject(AuthIdentityService) private readonly identityService: AuthIdentityService) {}

    async verify(token: string): Promise<LogoutTarget | null> {
        const header = (jwt.decode(token, { complete: true }) as { header?: { typ?: string } } | null)?.header;
        if (header?.typ !== 'logout+jwt') {
            this.logger.warn('Logout token refused', { reason: 'typ' });
            return null;
        }

        let claims: jwt.JwtPayload;
        try {
            claims = await this.identityService.verifySignedByAuth(token, {
                issuer: getOidcIssuer(),
                audience: getOidcClientId(),
                maxAge: MAX_AGE_SECONDS
            });
        } catch (error) {
            this.logger.warn('Logout token refused', { reason: error instanceof Error ? error.message : 'invalid' });
            return null;
        }

        const events = claims.events as Record<string, unknown> | undefined;
        const event = events?.[BACKCHANNEL_LOGOUT_EVENT];
        const sid = typeof claims.sid === 'string' && claims.sid ? claims.sid : undefined;
        const sub = typeof claims.sub === 'string' && claims.sub ? claims.sub : undefined;
        if (
            !event ||
            typeof event !== 'object' ||
            'nonce' in claims ||
            typeof claims.iat !== 'number' ||
            (!sid && !sub)
        ) {
            this.logger.warn('Logout token refused', { reason: 'claims' });
            return null;
        }
        return { sid, sub };
    }
}
