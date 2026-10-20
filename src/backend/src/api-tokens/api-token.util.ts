import { createHash, randomUUID } from 'crypto';

export const API_TOKEN_PREFIX = 'legacy-calendar-';

/**
 * Raw tokens are shown to the user exactly once and never stored. The database
 * only keeps a SHA-256 hash plus a short hint that is safe to render in lists.
 */
export function generateApiToken(): string {
    return `${API_TOKEN_PREFIX}${randomUUID()}`;
}

export function hashApiToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}

export function buildApiTokenHint(token: string): string {
    const body = token.startsWith(API_TOKEN_PREFIX) ? token.slice(API_TOKEN_PREFIX.length) : token;
    if (body.length <= 8) {
        return `${API_TOKEN_PREFIX}${body}`;
    }

    return `${API_TOKEN_PREFIX}${body.slice(0, 4)}…${body.slice(-4)}`;
}

/**
 * Cheap shape check so random junk never reaches the database. The value is
 * still hashed and looked up, so this only filters obvious non-tokens.
 */
export function isApiTokenShape(token: string): boolean {
    if (!token.startsWith(API_TOKEN_PREFIX)) {
        return false;
    }

    const body = token.slice(API_TOKEN_PREFIX.length);
    return body.length >= 8 && body.length <= 128 && /^[A-Za-z0-9-]+$/.test(body);
}
