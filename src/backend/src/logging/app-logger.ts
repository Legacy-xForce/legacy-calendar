import type pino from 'pino';
import pinoFactory from 'pino';
import { PinoLogger } from 'nestjs-pino';
import { resolveDefaultLogLevel, type LogLevel } from './log-level.js';

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

export class AppLogger {
    private readonly logger: pino.Logger;

    constructor(
        private readonly context: string,
        private readonly minimumLevel: LogLevel = resolveDefaultLogLevel()
    ) {
        const rootLogger = PinoLogger.root ?? pinoFactory({ level: resolveDefaultLogLevel() });
        this.logger = rootLogger.child ? rootLogger.child({ context: this.context }) : rootLogger;
    }

    log(message: unknown, details?: LogDetails, context?: string): void {
        this.write('info', message, details, context);
    }

    error(message: unknown, details?: LogDetails, context?: string): void {
        this.write('error', message, details, context);
    }

    warn(message: unknown, details?: LogDetails, context?: string): void {
        this.write('warn', message, details, context);
    }

    debug(message: unknown, details?: LogDetails, context?: string): void {
        this.write('debug', message, details, context);
    }

    verbose(message: unknown, details?: LogDetails, context?: string): void {
        this.write('trace', message, details, context);
    }

    info(message: unknown, details?: LogDetails, context?: string): void {
        this.write('info', message, details, context);
    }

    trace(message: unknown, details?: LogDetails, context?: string): void {
        this.write('trace', message, details, context);
    }

    critical(message: unknown, details?: LogDetails, context?: string): void {
        this.write('critical', message, details, context);
    }

    fatal(message: unknown, details?: LogDetails, context?: string): void {
        this.write('fatal', message, details, context);
    }

    private write(level: LogLevel, message: unknown, details?: LogDetails, contextOverride?: string): void {
        if (!this.shouldLog(level)) {
            return;
        }

        const payload = this.buildPayload(details, contextOverride);
        this.getLevelLogger(level).call(this.logger, payload, this.stringify(message));
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
            return JSON.stringify(value, (key, val) => this.replacer(key, val));
        } catch {
            return String(value);
        }
    }

    private buildPayload(details: LogDetails, contextOverride?: string): Record<string, unknown> {
        const context = contextOverride ?? this.context;
        const base: Record<string, unknown> = { context };

        if (details === undefined) {
            return base;
        }

        if (details instanceof Error) {
            return {
                ...base,
                err: details
            };
        }

        if (typeof details === 'string') {
            return {
                ...base,
                details
            };
        }

        return {
            ...base,
            details
        };
    }

    private getLevelLogger(level: LogLevel): (obj: Record<string, unknown> | string, msg?: string) => void {
        const logger = this.logger as unknown as Record<
            string,
            (obj: Record<string, unknown> | string, msg?: string) => void
        >;

        if (level === 'critical') {
            return logger.critical ?? logger.error ?? logger.fatal;
        }

        return logger[level] ?? logger.info;
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
