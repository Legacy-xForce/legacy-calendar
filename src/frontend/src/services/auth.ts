import { baseURL, authBaseURL } from './API';

/**
 * Signing in happens at Legacy Auth: the backend's /auth/login sends the
 * browser there and its /auth/callback brings it back with a session cookie.
 * The app never sees a token.
 */

const REDIRECT_KEY = 'auth_redirect_at';
/** A second redirect this soon after the last one means the session cookie is not sticking; stop instead of looping. */
const LOOP_WINDOW_MS = 15_000;

const apiURL = (path: string) => `${(baseURL ?? '').replace(/\/+$/, '')}${path}`;

export function loginURL(options: { returnTo?: string; prompt?: 'login' } = {}): string {
    const params = new URLSearchParams();
    if (options.returnTo) params.set('returnTo', options.returnTo);
    if (options.prompt) params.set('prompt', options.prompt);
    const query = params.toString();
    return apiURL(`/auth/login${query ? `?${query}` : ''}`);
}

/**
 * Leaves the app for Legacy Auth's sign-in. Returns false instead when it just
 * did so, so a broken session cookie shows an error rather than a redirect loop.
 */
export function redirectToLogin(returnTo = currentPath(), prompt?: 'login'): boolean {
    try {
        const last = Number(sessionStorage.getItem(REDIRECT_KEY)) || 0;
        if (!prompt && Date.now() - last < LOOP_WINDOW_MS) return false;
        sessionStorage.setItem(REDIRECT_KEY, String(Date.now()));
    } catch {
        // storage unavailable: redirect anyway
    }
    window.location.assign(loginURL({ returnTo, prompt }));
    return true;
}

/** Called once a session is confirmed, so the next expiry may redirect again. */
export function clearLoginRedirect(): void {
    try {
        sessionStorage.removeItem(REDIRECT_KEY);
    } catch {
        // storage unavailable
    }
}

/** Where users manage their password and passkeys. */
export const accountSettingsURL = `${authBaseURL.replace(/\/+$/, '')}/settings`;

function currentPath(): string {
    return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}
