import { get, set } from 'idb-keyval';

type CacheEntry<T> = {
    data: T;
    timestamp: number;
};

export type CacheLookup<T> = { hit: true; value: T } | { hit: false };

function isCacheEntry(value: unknown): value is CacheEntry<unknown> {
    return (
        typeof value === 'object' &&
        value !== null &&
        'timestamp' in value &&
        typeof (value as CacheEntry<unknown>).timestamp === 'number' &&
        'data' in value
    );
}

/**
 * Read a TTL cache entry. Returning a hit flag keeps cached `null` values (for
 * example "geocode found nothing") distinct from a cache miss.
 */
export async function readTimedCache<T>(
    key: string,
    ttlMs: number,
    options: { allowLegacy?: boolean } = {}
): Promise<CacheLookup<T>> {
    const cached = await get(key);

    if (isCacheEntry(cached)) {
        if (Date.now() - cached.timestamp > ttlMs) {
            return { hit: false };
        }

        return { hit: true, value: cached.data as T };
    }

    // Older entries stored the value directly, without a timestamp.
    if (options.allowLegacy && cached !== undefined && cached !== null) {
        return { hit: true, value: cached as T };
    }

    return { hit: false };
}

export async function writeTimedCache<T>(key: string, data: T): Promise<void> {
    await set(key, { data, timestamp: Date.now() } satisfies CacheEntry<T>);
}
