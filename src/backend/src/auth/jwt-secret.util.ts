import type { ConfigService } from '@nestjs/config';
import { FORBIDDEN_JWT_SECRETS } from '../config/env.validation.js';

/**
 * Resolves the HS256 signing secret from configuration and fails fast when it is
 * missing or an insecure placeholder. Throwing here stops the application from
 * booting with an attacker-guessable key.
 */
export function resolveJwtSecret(configService: ConfigService): string {
    const secret = configService.get<string>('JWT_SECRET')?.trim();

    if (!secret) {
        throw new Error('JWT_SECRET is not configured. Refusing to start without an explicit JWT signing secret.');
    }

    if (FORBIDDEN_JWT_SECRETS.has(secret)) {
        throw new Error('JWT_SECRET is set to a well-known placeholder value. Configure a unique, random secret.');
    }

    return secret;
}
