import type { ConfigService } from '@nestjs/config';

/**
 * Well-known placeholder values that must never be accepted as a real secret.
 * They previously shipped as implicit fallbacks, which made forged HS256 tokens
 * (including admin tokens) possible whenever JWT_SECRET was not configured.
 */
const FORBIDDEN_SECRET_VALUES = new Set(['legacy-calendar-default-secret', 'changeme', 'secret', 'password']);

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

    if (FORBIDDEN_SECRET_VALUES.has(secret)) {
        throw new Error('JWT_SECRET is set to a well-known placeholder value. Configure a unique, random secret.');
    }

    return secret;
}
