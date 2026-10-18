/**
 * Public frontend origin, used to build shareable links (e.g. guest invites).
 *
 * `FRONTEND_URL` is a comma-separated allowlist (see `config/cors.ts`); the
 * first entry is the canonical user-facing origin. Read lazily per call so the
 * value comes from `ConfigModule`/`.env` rather than being frozen at import
 * time.
 */

const DEFAULT_FRONTEND_URL = 'https://calendar.legacy-group.tech';

export function getFrontendUrl(): string {
    const configured = process.env.FRONTEND_URL?.split(',')
        .map((origin) => origin.trim())
        .find(Boolean);

    return configured ?? DEFAULT_FRONTEND_URL;
}
