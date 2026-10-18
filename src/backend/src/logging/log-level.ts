/**
 * Shared log level type + parser used by the pino root logger and the
 * application-level `AppLogger` wrapper.
 */

export type LogLevel = 'fatal' | 'critical' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

export function normalizeLogLevel(level: string): LogLevel {
    const normalized = level.toLowerCase();
    if (
        normalized === 'fatal' ||
        normalized === 'critical' ||
        normalized === 'error' ||
        normalized === 'warn' ||
        normalized === 'info' ||
        normalized === 'debug' ||
        normalized === 'trace'
    ) {
        return normalized;
    }

    return 'trace';
}

/**
 * Resolved lazily (not at module import) so values loaded from `.env` by
 * `ConfigModule` are honoured in local development too.
 */
export function resolveDefaultLogLevel(): LogLevel {
    return normalizeLogLevel(process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'trace'));
}
