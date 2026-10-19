import type { ConfigService } from '@nestjs/config';
import { getAuthHost } from './auth-host.js';

/**
 * JWKS endpoint for the external auth service. Shared by the HTTP JWT strategy
 * and the Socket.IO gateway so the two never drift.
 */
export function resolveJwksUri(configService: ConfigService): string {
    const configured = configService.get<string>('AUTH_JWKS_URI')?.trim();
    if (configured) {
        return configured;
    }

    return `${getAuthHost().replace(/\/+$/, '')}/.well-known/jwks.json`;
}
