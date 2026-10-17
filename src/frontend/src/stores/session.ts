import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Session } from '../types/Session';
import api from '../services/API';
import type { AuthLoginDto } from '../types/Auth';
import type { User } from '../types/User';
import { createLogger } from '../services/logger';

import { getPasskeyAssertion, createPasskeyCredential } from '../services/webauthn';

const logger = createLogger('SessionStore');

export function parseJwtPayload(token: string): any {
    try {
        const parts = token.split('.');
        if (parts.length < 2) return null;
        let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        base64 += '='.repeat((4 - (base64.length % 4)) % 4);
        const json = decodeURIComponent(
            window
                .atob(base64)
                .split('')
                .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                .join('')
        );
        return JSON.parse(json);
    } catch {
        return null;
    }
}

export function hasCalendarScope(token: string): boolean {
    const payload = parseJwtPayload(token);
    if (!payload) return true;
    if (payload.scope === undefined && payload.scopes === undefined) return true;

    if (payload.scopes && typeof payload.scopes === 'object' && !Array.isArray(payload.scopes)) {
        return payload.scopes.calendar === true || payload.scopes['*'] === true || payload.scopes.all === true;
    }

    const scopes: string[] = Array.isArray(payload.scopes)
        ? payload.scopes
        : typeof payload.scope === 'string'
          ? payload.scope.split(' ').filter(Boolean)
          : [];

    if (scopes.length === 0) return false;
    return scopes.includes('calendar') || scopes.includes('*') || scopes.includes('all');
}

export function isAccountDisabled(token: string): boolean {
    const payload = parseJwtPayload(token);
    return payload?.disabled === true || payload?.status === 'disabled' || payload?.accountStatus === 'disabled';
}

export const useSessionStore = defineStore('session', () => {
    const session = ref<Session>({} as Session);
    const loading = ref(false);
    const error = ref<string | null>(null);

    const isAuthenticated = computed(() => !!session.value.token);
    const currentUser = computed(() => session.value.user);

    function save() {
        localStorage.setItem('token', session.value.token);
    }

    async function login(credentials: AuthLoginDto) {
        loading.value = true;
        error.value = null;
        logger.info('Login started', { username: credentials.username });
        try {
            const loginResponse = await api.login(credentials);
            const token = loginResponse.data.access_token;
            const refreshToken = loginResponse.data.refresh_token;

            if (isAccountDisabled(token)) {
                logger.warn('Login blocked: account disabled');
                window.location.href = '/disabled';
                return false;
            }

            if (!hasCalendarScope(token)) {
                logger.warn('Token missing calendar scope');
                window.location.href = '/insufficient-scope';
                return false;
            }

            // Store tokens
            localStorage.setItem('token', token);
            localStorage.setItem('refresh_token', refreshToken);
            session.value.token = token;
            session.value.refreshToken = refreshToken;

            // Fetch user profile
            const profileResponse = await api.getProfile();
            session.value.user = profileResponse.data;
            logger.info('Login completed', {
                userId: profileResponse.data.id,
                username: profileResponse.data.username
            });

            return true;
        } catch (err: any) {
            const errData = err.response?.data;
            const errMsg = String(errData?.message || errData?.error || '').toLowerCase();

            if (err.response?.status === 403 || errMsg.includes('disabled') || errData?.status === 'disabled') {
                logger.warn('Login blocked: account disabled');
                window.location.href = '/disabled';
                return false;
            }

            if (errMsg.includes('scope') || errData?.error === 'insufficient_scope') {
                logger.warn('Login blocked: insufficient scope');
                window.location.href = '/insufficient-scope';
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
            if (isAccountDisabled(token)) {
                window.location.href = '/disabled';
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

    function clearError() {
        error.value = null;
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

            if (isAccountDisabled(token)) {
                window.location.href = '/disabled';
                return false;
            }

            if (!hasCalendarScope(token)) {
                logger.warn('Token missing calendar scope');
                window.location.href = '/insufficient-scope';
                return false;
            }

            localStorage.setItem('token', token);
            localStorage.setItem('refresh_token', refreshToken);
            session.value.token = token;
            session.value.refreshToken = refreshToken;

            const profileResponse = await api.getProfile();
            session.value.user = profileResponse.data;
            logger.info('Passkey login completed', {
                userId: profileResponse.data.id,
                username: profileResponse.data.username
            });
            return true;
        } catch (err: any) {
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
        clearError,
        updateProfile,
        changePassword
    };
});
