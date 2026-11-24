type LogLevel = 'fatal' | 'critical' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

type LogDetails = unknown;

const LEVEL_ORDER: Record<LogLevel, number> = {
    fatal: 0,
    critical: 1,
    error: 2,
    warn: 3,
    info: 4,
    debug: 5,
    trace: 6
};

const DEFAULT_LEVEL = normalizeLevel(import.meta.env.VITE_LOG_LEVEL ?? (import.meta.env.DEV ? 'trace' : 'info'));

class FrontendLogger {
    private readonly scope: string;
    private readonly minimumLevel: LogLevel;

    constructor(scope: string, minimumLevel: LogLevel) {
        this.scope = scope;
        this.minimumLevel = minimumLevel;
    }

    fatal(message: unknown, details?: LogDetails): void {
        this.write('fatal', message, details);
    }

    critical(message: unknown, details?: LogDetails): void {
        this.write('critical', message, details);
    }

    error(message: unknown, details?: LogDetails): void {
        this.write('error', message, details);
    }

    warn(message: unknown, details?: LogDetails): void {
        this.write('warn', message, details);
    }

    info(message: unknown, details?: LogDetails): void {
        this.write('info', message, details);
    }

    debug(message: unknown, details?: LogDetails): void {
        this.write('debug', message, details);
    }

    trace(message: unknown, details?: LogDetails): void {
        this.write('trace', message, details);
    }

    private write(level: LogLevel, message: unknown, details?: LogDetails): void {
        if (!this.shouldLog(level)) {
            return;
        }

        const timestamp = new Date().toISOString();
        const payload = this.formatDetails(details);
        const text = `${this.stringify(message)}${payload ? ` ${payload}` : ''}`;
        const line = `[${timestamp}] [${level.toUpperCase()}] [${this.scope}] ${text}`;

        if (level === 'warn') {
            console.warn(line);
            return;
        }

        if (level === 'debug' || level === 'trace') {
            console.debug(line);
            return;
        }

        if (level === 'fatal' || level === 'critical' || level === 'error') {
            console.error(line);
            return;
        }

        console.info(line);
    }

    private shouldLog(level: LogLevel): boolean {
        return LEVEL_ORDER[level] <= LEVEL_ORDER[this.minimumLevel];
    }

    private stringify(value: unknown): string {
        if (typeof value === 'string') {
            return value;
        }

        if (value instanceof Error) {
            return `${value.name}: ${value.message}`;
        }

        try {
            return JSON.stringify(value, this.replacer);
        } catch {
            return String(value);
        }
    }

    private formatDetails(details: LogDetails): string {
        if (details === undefined) {
            return '';
        }

        if (details instanceof Error) {
            return `${details.name}: ${details.message}${details.stack ? ` | ${details.stack}` : ''}`;
        }

        if (typeof details === 'string') {
            return details;
        }

        try {
            return JSON.stringify(details, this.replacer);
        } catch {
            return String(details);
        }
    }

    private replacer(_key: string, value: unknown): unknown {
        if (value instanceof Error) {
            return {
                name: value.name,
                message: value.message,
                stack: value.stack
            };
        }

        if (typeof value === 'bigint') {
            return value.toString();
        }

        return value;
    }
}

export function createLogger(scope: string) {
    return new FrontendLogger(scope, DEFAULT_LEVEL);
}

function normalizeLevel(level: string): LogLevel {
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
