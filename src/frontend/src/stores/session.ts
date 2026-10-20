import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Session } from '../types/Session';
import api from '../services/API';
import type { AuthLoginDto } from '../types/Auth';
import type { User } from '../types/User';
import { createLogger } from '../services/logger';
import {
    accountIssueFromError,
    accountIssueFromToken,
    assertAccountUsable,
    redirectToAccountNotice
} from '../utils/account';

import { getPasskeyAssertion, createPasskeyCredential } from '../services/webauthn';

const logger = createLogger('SessionStore');

export const useSessionStore = defineStore('session', () => {
    const session = ref<Session>({} as Session);
    const loading = ref(false);
    const error = ref<string | null>(null);

    const isAuthenticated = computed(() => !!session.value.token);
    const currentUser = computed(() => session.value.user);

    function save() {
        localStorage.setItem('token', session.value.token);
    }

    /** Persist the tokens and load the profile that all logged-in flows need. */
    async function establishSession(token: string, refreshToken?: string) {
        const nextRefreshToken = refreshToken || token;
        localStorage.setItem('token', token);
        localStorage.setItem('refresh_token', nextRefreshToken);
        session.value.token = token;
        session.value.refreshToken = nextRefreshToken;

        const profileResponse = await api.getProfile();
        session.value.user = profileResponse.data;
        return profileResponse.data;
    }

    async function login(credentials: AuthLoginDto) {
        loading.value = true;
        error.value = null;
        logger.info('Login started', { username: credentials.username });
        try {
            const loginResponse = await api.login(credentials);
            const token = loginResponse.data.access_token;
            const refreshToken = loginResponse.data.refresh_token;

            if (!assertAccountUsable(token)) {
                logger.warn('Login blocked: account not usable');
                return false;
            }

            const user = await establishSession(token, refreshToken);
            logger.info('Login completed', { userId: user.id, username: user.username });

            return true;
        } catch (err: any) {
            const issue = accountIssueFromError(err);
            if (issue) {
                logger.warn(`Login blocked: ${issue}`);
                redirectToAccountNotice(issue);
                return false;
            }

            error.value = err.response?.data?.message || 'Login failed. Please check your credentials.';
            logger.warn('Login failed', {
                username: credentials.username,
                status: err.response?.status,
                message: err.response?.data?.message ?? err.message
            });
            localStorage.removeItem('token');
            localStorage.removeItem('refresh_token');
            session.value = {} as Session;
            return false;
        } finally {
            loading.value = false;
        }
    }

    async function load() {
        const token = localStorage.getItem('token') ?? null;

        if (!token) {
            return false;
        }
        loading.value = true;
        error.value = null;
        logger.debug('Restoring session from local storage');
        try {
            session.value.token = token;
            // The router guard sends protected routes to /disabled. Navigating from here as well
            // would reload /disabled itself on every mount.
            if (accountIssueFromToken(token)) {
                return false;
            }
            const response = await api.getProfile();
            session.value = {
                token: localStorage.getItem('token')!,
                refreshToken: localStorage.getItem('refresh_token') ?? undefined,
                user: response.data
            };
            logger.info('Session restored', { userId: response.data.id, username: response.data.username });
            return true;
        } catch {
            // Token (and refresh token, if any) are invalid or expired
            error.value = 'Session expired. Please log in again.';
            logger.warn('Stored session expired');
            localStorage.removeItem('token');
            localStorage.removeItem('refresh_token');
            session.value = {} as Session;
            return false;
        } finally {
            loading.value = false;
        }
    }

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
        session.value = {} as Session;
        localStorage.removeItem('token');
        localStorage.removeItem('refresh_token');
        logger.info('Logged out');
    }

    async function updateProfile(updates: Partial<User>) {
        if (session.value.user) {
            session.value.user = { ...session.value.user, ...updates };
        }
    }

    async function changePassword(currentPassword: string, newPassword: string) {
        try {
            loading.value = true;
            logger.info('Changing password');
            await api.changePassword({ currentPassword, newPassword });
            logger.info('Password changed');
            return true;
        } catch (error: any) {
            logger.error('Failed to change password', error);
            throw error;
        } finally {
            loading.value = false;
        }
    }

    async function loginWithPasskey(username?: string) {
        loading.value = true;
        error.value = null;
        logger.info('Passkey login started');
        try {
            const optionsRes = await api.getPasskeyLoginOptions(username);
            const assertion = await getPasskeyAssertion(optionsRes.data);
            const verifyRes = await api.verifyPasskeyLogin(assertion);

            const token = verifyRes.data.access_token;
            const refreshToken = verifyRes.data.refresh_token || token;

            if (!assertAccountUsable(token)) {
                logger.warn('Passkey login blocked: account not usable');
                return false;
            }

            const user = await establishSession(token, refreshToken);
            logger.info('Passkey login completed', { userId: user.id, username: user.username });
            return true;
        } catch (err: any) {
            const issue = accountIssueFromError(err);
            if (issue) {
                logger.warn(`Passkey login blocked: ${issue}`);
                redirectToAccountNotice(issue);
                return false;
            }

            error.value = err.response?.data?.message || err.message || 'Passkey login failed';
            logger.warn('Passkey login failed', err);
            return false;
        } finally {
            loading.value = false;
        }
    }

    async function registerPasskey(deviceName?: string) {
        loading.value = true;
        error.value = null;
        logger.info('Passkey registration started');
        try {
            const optionsRes = await api.getPasskeyRegisterOptions();
            const credential = await createPasskeyCredential(optionsRes.data);
            const verifyRes = await api.verifyPasskeyRegister({
                ...credential,
                deviceName
            });
            logger.info('Passkey registration completed');
            return verifyRes.data;
        } catch (err: any) {
            error.value = err.response?.data?.message || err.message || 'Passkey registration failed';
            logger.error('Passkey registration failed', err);
            throw err;
        } finally {
            loading.value = false;
        }
    }

    return {
        session,
        loading,
        error,
        isAuthenticated,
        currentUser,
        save,
        login,
        loginWithPasskey,
        registerPasskey,
        load,
        logout,
        updateProfile,
        changePassword
    };
});
