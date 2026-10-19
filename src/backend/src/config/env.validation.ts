/**
 * Validates required environment variables at bootstrap time. Runs through
 * `ConfigModule.forRoot({ validate })`, so a misconfigured deployment fails
 * immediately with a clear message instead of silently falling back to insecure
 * defaults at request time.
 */

const REQUIRED_KEYS = ['DATABASE_URL', 'JWT_SECRET'] as const;

/**
 * Well-known placeholder values that must never be accepted as a real secret.
 * Shared with the runtime resolver so validation and boot rules cannot drift.
 */
export const FORBIDDEN_JWT_SECRETS = new Set(['legacy-calendar-default-secret', 'changeme', 'secret', 'password']);

export function validateEnvironment(config: Record<string, unknown>): Record<string, unknown> {
    const errors: string[] = [];

    for (const key of REQUIRED_KEYS) {
        const value = config[key];
        if (typeof value !== 'string' || !value.trim()) {
            errors.push(`${key} is required`);
        }
    }

    const jwtSecret = typeof config.JWT_SECRET === 'string' ? config.JWT_SECRET.trim() : '';
    if (jwtSecret && FORBIDDEN_JWT_SECRETS.has(jwtSecret)) {
        errors.push('JWT_SECRET must be a unique random value, not a well-known placeholder');
    }

    if (errors.length > 0) {
        throw new Error(`Invalid environment configuration:\n - ${errors.join('\n - ')}`);
    }

    return config;
}
