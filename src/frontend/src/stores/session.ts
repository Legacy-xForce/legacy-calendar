import { defineStore } from 'pinia';
import { computed, ref, shallowRef } from 'vue';
import api from '../services/API';
import type { User } from '../types/User';
import { createLogger } from '../services/logger';
import { withRefreshLock } from '../services/lock';
import * as oidc from '../services/oidc';
import { AuthError, AuthRejectedError, SignInDeniedError } from '../services/oidc';
import { storage } from '../services/storage';
import { accountIssueFromToken } from '../utils/account';

const logger = createLogger('SessionStore');

// The OP grant: refresh token and ID token (sign-out hint). The access token never leaves memory.
export const STORAGE_KEY = 'legacycalendar.oidc';
// Refresh a little early so a request never goes out with a token about to lapse.
const REFRESH_MARGIN_MS = 60_000;

// A session that ended without the user asking: revoked or expired at Legacy Auth, access
// removed, or signed out in another app.
export const SESSION_ENDED_MESSAGE = 'Your session ended. Sign in again to continue.';

interface StoredGrant {
    refreshToken: string;
    idToken: string | null;
}

interface AccessGrant {
    accessToken: string;
    expiresAt: number;
}

function loadGrant(): StoredGrant | null {
    const raw = storage.get(STORAGE_KEY);
    if (!raw) return null;
    try {
        const stored: unknown = JSON.parse(raw);
        const record = stored !== null && typeof stored === 'object' ? (stored as Record<string, unknown>) : null;
        if (typeof record?.refreshToken !== 'string') return null;
        return {
            refreshToken: record.refreshToken,
            idToken: typeof record.idToken === 'string' ? record.idToken : null
        };
    } catch {
        return null;
    }
}

function saveGrant(grant: StoredGrant) {
    storage.set(STORAGE_KEY, JSON.stringify(grant));
}

function isFresh(grant: AccessGrant | null): grant is AccessGrant {
    return !!grant && grant.expiresAt - Date.now() >= REFRESH_MARGIN_MS;
}

export const useSessionStore = defineStore('session', () => {
    // The access token lives in memory only; the refresh token is what survives a reload.
    const access = shallowRef<AccessGrant | null>(null);
    const user = ref<User | undefined>();
    const loading = ref(false);
    /** Shown on the sign-in screen: why the last sign-in or session ended. */
    const error = ref<string | null>(null);
    let refreshing: Promise<void> | null = null;
    let restoring: Promise<boolean> | null = null;
    let loadingProfile: Promise<boolean> | null = null;

    const isAuthenticated = computed(() => access.value !== null);
    const currentUser = computed(() => user.value);
    const accessToken = computed(() => access.value?.accessToken ?? null);

    function clear() {
        access.value = null;
        user.value = undefined;
        storage.remove(STORAGE_KEY);
    }

    /** Ends the session here, leaving `message` for the sign-in screen. */
    function endSession(message: string | null = null) {
        clear();
        error.value = message;
    }

    async function refreshOidc(): Promise<void> {
        await withRefreshLock(async () => {
            // Read inside the lock: another tab may have rotated the token or signed out.
            const stored = loadGrant();
            if (!stored) throw new AuthRejectedError('No session.', 401);
            const next = await oidc.refreshGrant(stored.refreshToken);
            saveGrant({ ...stored, refreshToken: next.refreshToken });
            access.value = { accessToken: next.accessToken, expiresAt: next.expiresAt };
            error.value = null;
        });
    }

    /** Refreshes the access token, sharing one request among concurrent callers. */
    function refresh(): Promise<void> {
        refreshing ??= refreshOidc()
            .catch((failure) => {
                // A network failure is transient: keep the session and let the caller retry.
                if (failure instanceof AuthRejectedError) {
                    logger.warn('Refresh refused, ending the session', { status: failure.status });
                    endSession(failure.status === 403 ? failure.message : SESSION_ENDED_MESSAGE);
                }
                throw failure;
            })
            .finally(() => {
                refreshing = null;
            });
        return refreshing;
    }

    /** A valid access token, refreshing first when it is about to expire. Null when signed out. */
    async function getAccessToken(): Promise<string | null> {
        if (access.value && !isFresh(access.value)) {
            try {
                await refresh();
            } catch {
                // Rejected: the session is already cleared. Transient: use what we have.
            }
        }
        return access.value?.accessToken ?? null;
    }

    /** Resumes a session from the stored refresh token, once per page load. Returns whether one is active. */
    function restore(): Promise<boolean> {
        restoring ??= (async () => {
            if (access.value) return true;
            if (!loadGrant()) return false;
            try {
                await refresh();
            } catch {
                return false;
            }
            return access.value !== null;
        })();
        return restoring;
    }

    /** Loads the stored session and the account profile. Returns whether the user is signed in. */
    function load(): Promise<boolean> {
        // The app shell and the router guard both ask for the profile on a cold start, and the
        // callback flow asks again right after signing in: share the one request.
        loadingProfile ??= loadProfile().finally(() => {
            loadingProfile = null;
        });
        return loadingProfile;
    }

    async function loadProfile(): Promise<boolean> {
        if (!(await restore())) return false;
        // A disabled account or a token without calendar access never loads a profile; the router
        // sends it to its notice page.
        if (accountIssueFromToken(access.value?.accessToken)) return true;
        if (user.value) return true;
        loading.value = true;
        try {
            user.value = (await api.getProfile()).data;
            logger.info('Session restored', { userId: user.value.id, username: user.value.username });
            return true;
        } catch (failure) {
            logger.warn('Loading the profile failed', failure);
            return isAuthenticatedNow();
        } finally {
            loading.value = false;
        }
    }

    // `isAuthenticated` read after an await: TypeScript can't see that refresh may have cleared it.
    function isAuthenticatedNow(): boolean {
        return isAuthenticated.value;
    }

    /** Sends the browser to Legacy Auth to sign in. Throws AuthError when it can't be reached. */
    async function signIn(returnTo = '/calendar', switchAccount = false): Promise<void> {
        error.value = null;
        window.location.assign(await oidc.signInUrl(returnTo, switchAccount));
    }

    /** Completes a sign-in from the OP's redirect. Returns the path to continue at. */
    async function completeSignIn(callbackUrl: URL): Promise<string> {
        loading.value = true;
        try {
            const result = await oidc.finishSignIn(callbackUrl);
            // Not clear(): removing the grant key would sign out the other tabs.
            saveGrant({ refreshToken: result.refreshToken, idToken: result.idToken });
            access.value = { accessToken: result.accessToken, expiresAt: result.expiresAt };
            user.value = undefined;
            error.value = null;
            restoring = Promise.resolve(true);
            return result.returnTo;
        } catch (failure) {
            if (failure instanceof SignInDeniedError) {
                endSession();
                return '/insufficient-scope';
            }
            endSession(failure instanceof AuthError ? failure.message : 'Sign-in failed. Please try again.');
            return '/';
        } finally {
            loading.value = false;
        }
    }

    /** Signs out here and at Legacy Auth (which ends it for every app). */
    async function logout(): Promise<void> {
        const fcmToken = storage.get('fcm_token');
        if (fcmToken) {
            try {
                logger.debug('Unsubscribing notifications on logout');
                await api.unsubscribeNotifications(fcmToken);
            } catch (failure) {
                logger.warn('Failed to unsubscribe from notifications on logout', failure);
            } finally {
                storage.remove('fcm_token');
            }
        }
        const grant = loadGrant();
        endSession();
        restoring = null;
        logger.info('Logged out');
        try {
            window.location.assign(await oidc.signOutUrl(grant?.idToken ?? null));
        } catch {
            // Offline: the local session is gone, the OP one ends with its own timeout.
        }
    }

    /** The session ended elsewhere (a request got a 401 that a refresh couldn't fix). */
    function expire(message: string = SESSION_ENDED_MESSAGE) {
        endSession(message);
    }

    async function updateProfile(updates: Partial<User>) {
        if (user.value) {
            user.value = { ...user.value, ...updates };
        }
    }

    return {
        loading,
        error,
        isAuthenticated,
        currentUser,
        accessToken,
        getAccessToken,
        refresh,
        restore,
        load,
        signIn,
        completeSignIn,
        logout,
        expire,
        updateProfile
    };
});
