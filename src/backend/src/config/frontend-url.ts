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

/**
 * The deployed web app a browser landing on the API root is sent to.
 *
 * Not taken from `FRONTEND_URL`: that allowlist exists for CORS and guest
 * links, and may name the API's own origin, which would make the redirect a
 * loop. `WEB_APP_URL` overrides the Pages origin below.
 */
const DEFAULT_WEB_APP_URL = 'https://legacy-calendar.pages.dev';

export function getWebAppUrl(): string {
    return process.env.WEB_APP_URL?.trim() || DEFAULT_WEB_APP_URL;
}
