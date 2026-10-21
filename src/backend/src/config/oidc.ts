import { getFrontendUrl } from './frontend-url.js';
import { getAuthHost } from './auth-host.js';

/**
 * Where and how the calendar signs users in through Legacy Auth (OpenID
 * Connect, Authorization Code + PKCE). Read lazily per call, like the other
 * config helpers, so the values come from `ConfigModule`/`.env`.
 */

/** Resource indicator (RFC 8707) of the calendar API at Legacy Auth; tokens for it carry `aud: "calendar"`. */
export const CALENDAR_RESOURCE = 'urn:legacy:calendar';

/** `offline_access` gets a refresh token, so the session outlives one access token. */
export const OIDC_SCOPES = 'openid profile calendar.read calendar.write offline_access';

const read = (key: string) => process.env[key]?.trim() || undefined;

/** The OpenID Provider's issuer. Defaults to `AUTH_ISSUER`, then `AUTH_HOST`. */
export function getOidcIssuer(): string {
    return (read('OIDC_ISSUER') ?? read('AUTH_ISSUER') ?? getAuthHost()).replace(/\/+$/, '');
}

export function getOidcClientId(): string {
    return read('OIDC_CLIENT_ID') ?? 'calendar-web';
}

export function getOidcClientSecret(): string {
    return read('OIDC_CLIENT_SECRET') ?? '';
}

/** Must match a redirect URI registered for the client exactly. */
export function getOidcRedirectUri(): string {
    return read('OIDC_REDIRECT_URI') ?? `${getFrontendUrl().replace(/\/+$/, '')}/auth/callback`;
}

/** Where Legacy Auth sends the browser after signing out; must be registered for the client. */
export function getOidcPostLogoutRedirectUri(): string {
    return read('OIDC_POST_LOGOUT_REDIRECT_URI') ?? `${getFrontendUrl().replace(/\/+$/, '')}/`;
}

/** The 32-byte key that encrypts the tokens stored with each session. */
export function getSessionEncryptionKey(): Buffer {
    return parseSessionEncryptionKey(read('SESSION_ENCRYPTION_KEY') ?? '');
}

/** Accepts base64 or base64url; anything that does not decode to 32 bytes is refused. */
export function parseSessionEncryptionKey(value: string): Buffer {
    const key = Buffer.from(value.trim(), 'base64');
    if (key.length !== 32) {
        throw new Error('SESSION_ENCRYPTION_KEY must be 32 random bytes, base64-encoded (openssl rand -base64 32)');
    }
    return key;
}

/**
 * Secure (`__Host-`) cookies need https. Locally and in tests the app runs on
 * plain http, so the cookies drop the prefix and the Secure flag there.
 */
export function useSecureCookies(): boolean {
    return getOidcRedirectUri().startsWith('https://');
}
