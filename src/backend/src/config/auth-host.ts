/**
 * Base URL of the external auth microservice.
 *
 * Read lazily (per call) rather than captured at module import: `ConfigModule`
 * loads `.env` during bootstrap, which happens *after* these modules are
 * imported. Capturing `process.env` at the top level would silently fall back to
 * the production default when running locally with only a `.env` file.
 */

const DEFAULT_AUTH_HOST = 'https://auth.legacy-group.tech';

export function getAuthHost(): string {
    return process.env.AUTH_HOST?.trim() || DEFAULT_AUTH_HOST;
}
