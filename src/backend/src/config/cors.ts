/**
 * Origin allowlist shared by the HTTP server and the Socket.IO gateway.
 *
 * `FRONTEND_URL` accepts a comma-separated list of allowed origins. Each entry
 * also permits its subdomains (e.g. `https://calendar.example.com` allows
 * `https://app.calendar.example.com`); a leading `*.` (`https://*.example.com`)
 * is accepted for clarity and behaves the same way.
 *
 * Matching requires the protocol and port to match too, so a configured HTTPS
 * origin never allows a plain-HTTP subdomain. Localhost development origins are
 * always permitted so the Vite dev server keeps working without extra config.
 */

const LOCAL_DEV_ORIGINS = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
];

type OriginRule = {
    protocol: string;
    port: string;
    hostname: string;
};

function getConfiguredOrigins(): string[] {
    return (process.env.FRONTEND_URL ?? '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);
}

function toOriginRule(configured: string): OriginRule | null {
    // `URL` rejects a bare `*` label, so strip it before parsing. The wildcard
    // is equivalent to the plain entry because subdomains are always allowed.
    const value = configured.replace('://*.', '://');

    try {
        const url = new URL(value);
        return {
            protocol: url.protocol,
            port: url.port,
            hostname: url.hostname
        };
    } catch {
        return null;
    }
}

/** Exact host, or any depth of subdomain, with the same scheme and port. */
function matchesOriginRule(origin: URL, rule: OriginRule): boolean {
    if (origin.protocol !== rule.protocol || origin.port !== rule.port) {
        return false;
    }

    return origin.hostname === rule.hostname || origin.hostname.endsWith(`.${rule.hostname}`);
}

export function getAllowedOrigins(): string[] {
    return [...new Set([...getConfiguredOrigins(), ...LOCAL_DEV_ORIGINS])];
}

/**
 * A missing origin means a non-browser client (curl, server-to-server) or a
 * same-origin request; those are allowed. Browser requests must match the list.
 */
export function isOriginAllowed(origin?: string | null): boolean {
    if (!origin) {
        return true;
    }

    const normalized = origin.trim();
    if (!normalized) {
        return true;
    }

    if (LOCAL_DEV_ORIGINS.includes(normalized)) {
        return true;
    }

    let parsedOrigin: URL;
    try {
        parsedOrigin = new URL(normalized);
    } catch {
        return false;
    }

    return getConfiguredOrigins().some((configured) => {
        const rule = toOriginRule(configured);
        return rule !== null && matchesOriginRule(parsedOrigin, rule);
    });
}
