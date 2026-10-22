/**
 * Validates required environment variables at bootstrap time. Runs through
 * `ConfigModule.forRoot({ validate })`, so a misconfigured deployment fails
 * immediately with a clear message instead of silently falling back to insecure
 * defaults at request time.
 */

const REQUIRED_KEYS = ['DATABASE_URL'] as const;

export function validateEnvironment(config: Record<string, unknown>): Record<string, unknown> {
    const errors: string[] = [];

    for (const key of REQUIRED_KEYS) {
        const value = config[key];
        if (typeof value !== 'string' || !value.trim()) {
            errors.push(`${key} is required`);
        }
    }

    if (errors.length > 0) {
        throw new Error(`Invalid environment configuration:\n - ${errors.join('\n - ')}`);
    }

    return config;
}
