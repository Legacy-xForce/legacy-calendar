import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from '../services/API';
import type { User } from '../types/User';
import { createLogger } from '../services/logger';
import { clearLoginRedirect } from '../services/auth';

const logger = createLogger('SessionStore');

// Left behind by the password login this app used before signing in through Legacy Auth.
for (const key of ['token', 'refresh_token', 'session_expired']) {
    try {
        localStorage.removeItem(key);
    } catch {
        // storage unavailable
    }
}

/**
 * The signed-in user. The session itself is an HttpOnly cookie the backend
 * manages, so "signed in" means the profile loads.
 */
export const useSessionStore = defineStore('session', () => {
    const user = ref<User | null>(null);
    const loading = ref(false);
    const error = ref<string | null>(null);
    let pending: Promise<boolean> | null = null;
    let loaded = false;

    const isAuthenticated = computed(() => !!user.value);
    const currentUser = computed(() => user.value ?? undefined);

    /** Loads the profile once (again with `force`); false when there is no session. */
    function load(force = false): Promise<boolean> {
        if (loaded && !force) return Promise.resolve(!!user.value);
        pending ??= (async () => {
            loading.value = true;
            error.value = null;
            try {
                const response = await api.getProfile({ skipAuthRedirect: true });
                user.value = response.data;
                clearLoginRedirect();
                logger.info('Session loaded', { userId: response.data.id, username: response.data.username });
                return true;
            } catch (err: any) {
                user.value = null;
                if (err?.response?.status !== 401) {
                    error.value = 'Could not reach the calendar. Check your connection and try again.';
                    logger.warn('Loading the session failed', err);
                }
                return false;
            } finally {
                loaded = true;
                loading.value = false;
                pending = null;
            }
        })();
        return pending;
    }

    /** Ends the session here and at Legacy Auth, which signs the browser out of every Legacy app. */
    async function logout() {
        const fcmToken = localStorage.getItem('fcm_token');
        if (fcmToken) {
            try {
                logger.debug('Unsubscribing notifications on logout');
                await api.unsubscribeNotifications(fcmToken);
            } catch (err) {
                logger.warn('Failed to unsubscribe from notifications on logout', err);
            } finally {
                localStorage.removeItem('fcm_token');
            }
        }
        localStorage.removeItem('impersonate_user_id');

        let redirect = '/';
        try {
            redirect = (await api.logout()).data.redirect;
        } catch (err) {
            logger.warn('Logout request failed', err);
        }
        user.value = null;
        logger.info('Logged out');
        window.location.assign(redirect);
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
        load,
        logout,
        updateProfile
    };
});
