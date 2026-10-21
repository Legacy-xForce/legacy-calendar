/**
 * Validates required environment variables at bootstrap time. Runs through
 * `ConfigModule.forRoot({ validate })`, so a misconfigured deployment fails
 * immediately with a clear message instead of silently falling back to insecure
 * defaults at request time.
 */

import { parseSessionEncryptionKey } from './oidc.js';

const REQUIRED_KEYS = ['DATABASE_URL', 'OIDC_CLIENT_SECRET', 'SESSION_ENCRYPTION_KEY'] as const;

/** Well-known placeholder values that must never be accepted as a real secret. */
export const FORBIDDEN_SECRETS = new Set(['legacy-calendar-default-secret', 'changeme', 'secret', 'password']);

export function validateEnvironment(config: Record<string, unknown>): Record<string, unknown> {
    const errors: string[] = [];

    for (const key of REQUIRED_KEYS) {
        const value = config[key];
        if (typeof value !== 'string' || !value.trim()) {
            errors.push(`${key} is required`);
        }
    }

    const clientSecret = typeof config.OIDC_CLIENT_SECRET === 'string' ? config.OIDC_CLIENT_SECRET.trim() : '';
    if (clientSecret && FORBIDDEN_SECRETS.has(clientSecret)) {
        errors.push('OIDC_CLIENT_SECRET must be the secret Legacy Auth issued for this client, not a placeholder');
    }

    const encryptionKey = typeof config.SESSION_ENCRYPTION_KEY === 'string' ? config.SESSION_ENCRYPTION_KEY.trim() : '';
    if (encryptionKey) {
        try {
            parseSessionEncryptionKey(encryptionKey);
        } catch (error) {
            errors.push((error as Error).message);
        }
    }

    if (errors.length > 0) {
        throw new Error(`Invalid environment configuration:\n - ${errors.join('\n - ')}`);
    }

    return config;
}
