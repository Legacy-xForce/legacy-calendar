/**
 * Origin allowlist shared by the HTTP server and the Socket.IO gateway.
 *
 * `FRONTEND_URL` accepts a comma-separated list of allowed origins. Localhost
 * development origins are always permitted so the Vite dev server keeps working
 * without extra configuration.
 */

const LOCAL_DEV_ORIGINS = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
];

export function getAllowedOrigins(): string[] {
    const configured = (process.env.FRONTEND_URL ?? '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);

    return [...new Set([...configured, ...LOCAL_DEV_ORIGINS])];
}

/**
 * A missing origin means a non-browser client (curl, server-to-server) or a
 * same-origin request; those are allowed. Browser requests must match the list.
 */
export function isOriginAllowed(origin?: string | null): boolean {
    if (!origin) {
        return true;
    }

    return getAllowedOrigins().includes(origin);
}
