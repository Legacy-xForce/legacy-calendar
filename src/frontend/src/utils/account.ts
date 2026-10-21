import { redirectToLogin } from '../services/auth';

/**
 * Legacy Auth shows its own page when an account may not use the calendar.
 * These are the calendar's fallbacks for when it still sends the browser back
 * with `access_denied` (the backend's /auth/callback routes to them).
 */

/** Signs in again with a fresh login at Legacy Auth, e.g. as another account. */
export function signInWithAnotherAccount(): void {
    redirectToLogin('/calendar', 'login');
}
