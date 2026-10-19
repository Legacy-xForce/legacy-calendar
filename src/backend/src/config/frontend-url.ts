/**
 * Public frontend origin, used to build shareable links (e.g. guest invites).
 *
 * `FRONTEND_URL` is a comma-separated allowlist (see `config/cors.ts`); the
 * first entry is the canonical user-facing origin. Read lazily per call so the
 * value comes from `ConfigModule`/`.env` rather than being frozen at import
 * time.
 */

const DEFAULT_FRONTEND_URL = 'https://calendar.legacy-group.tech';

/** Configured frontend origins, trimmed and without empty entries. */
export function getFrontendUrls(): string[] {
    return (process.env.FRONTEND_URL ?? '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);
}

export function getFrontendUrl(): string {
    return getFrontendUrls()[0] ?? DEFAULT_FRONTEND_URL;
}
