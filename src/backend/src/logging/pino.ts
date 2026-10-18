import { randomUUID } from 'crypto';
import pino, { type Logger, type LoggerOptions } from 'pino';
import type { Params } from 'nestjs-pino';
import { resolveDefaultLogLevel } from './log-level.js';

export function createRootLogger(): Logger {
    const options: LoggerOptions = {
        level: resolveDefaultLogLevel(),
        timestamp: pino.stdTimeFunctions.isoTime,
        customLevels: {
            critical: 55
        }
    };

    if (process.env.NODE_ENV !== 'production') {
        const transport = pino.transport({
            target: 'pino-pretty',
            options: {
                colorize: true,
                singleLine: true,
                translateTime: 'SYS:standard',
                ignore: 'pid,hostname'
            }
        });

        return pino(options, transport);
    }

    return pino(options);
}

export function createLoggerModuleParams(): Params {
    const rootLogger = createRootLogger();

    return {
        renameContext: 'context',
        pinoHttp: {
            logger: rootLogger,
            redact: {
                paths: ['res.headers["set-cookie"]'],
                censor: '[redacted]'
            },
            serializers: {
                // Drop headers entirely (they carry bearer tokens and cookies) and
                // scrub bearer-style secrets out of the request path.
                req(request: { method?: string; url?: string; remoteAddress?: string }) {
                    return {
                        method: request.method,
                        url: scrubSensitiveUrl(request.url),
                        remoteAddress: request.remoteAddress
                    };
                }
            },
            genReqId: (req) => {
                const headerRequestId = req.headers['x-request-id'];
                if (typeof headerRequestId === 'string' && headerRequestId.trim()) {
                    return headerRequestId.trim();
                }

                return randomUUID();
            },
            customLogLevel: (_req, res, err) => {
                if (err || res.statusCode >= 500) {
                    return 'error';
                }

                if (res.statusCode >= 400) {
                    return 'warn';
                }

                return 'info';
            }
        }
    };
}

// Guest magic-link tokens and invite paths are bearer credentials; never persist
// the raw value in logs.
const SENSITIVE_PATH_PATTERN = /(\/(?:guest-invites|invite)\/)[A-Za-z0-9_-]{8,}/g;

function scrubSensitiveUrl(url?: string): string | undefined {
    if (!url) {
        return url;
    }

    return url.replace(SENSITIVE_PATH_PATTERN, '$1[redacted]');
}
