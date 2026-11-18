import { createHash, randomUUID } from 'node:crypto';

/**
 * Feed links are bearer credentials: the secret lives in the URL itself,
 * because calendar clients subscribing by URL cannot send an Authorization
 * header. As with API tokens, only a SHA-256 hash is persisted.
 */
export const FEED_TOKEN_PREFIX = 'legacy-calendar-feed-';

export function generateFeedToken(): string {
    return `${FEED_TOKEN_PREFIX}${randomUUID()}`;
}

export function hashFeedToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}

/** Safe to display next to the copy button; never enough to reconstruct the URL. */
export function feedTokenHint(token: string): string {
    const id = token.slice(FEED_TOKEN_PREFIX.length);
    return `${FEED_TOKEN_PREFIX}${id.slice(0, 4)}…${id.slice(-4)}`;
}

/** Cheap shape check before hashing; the database lookup is the real check. */
export function isFeedTokenShape(token: string): boolean {
    if (!token.startsWith(FEED_TOKEN_PREFIX)) return false;
    const id = token.slice(FEED_TOKEN_PREFIX.length);
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id);
}
