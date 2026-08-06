import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Session } from '../types/Session';
import api from '../services/API';
import type { AuthLoginDto } from '../types/Auth';
import type { User } from '../types/User';
import { createLogger } from '../services/logger';

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

    async function login(credentials: AuthLoginDto) {
        loading.value = true;
        error.value = null;
        logger.info('Login started', { username: credentials.username });
        try {
            const loginResponse = await api.login(credentials);
            const token = loginResponse.data.access_token;

            // Store token
            localStorage.setItem('token', token);
            session.value.token = token;

            // Fetch user profile
            const profileResponse = await api.getProfile();
            session.value.user = profileResponse.data;
            logger.info('Login completed', {
                userId: profileResponse.data.id,
                username: profileResponse.data.username
            });

            return true;
        } catch (err: any) {
            error.value = err.response?.data?.message || 'Login failed. Please check your credentials.';
            logger.warn('Login failed', {
                username: credentials.username,
                status: err.response?.status,
                message: err.response?.data?.message ?? err.message
            });
            localStorage.removeItem('token');
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
            const response = await api.getProfile();
            session.value = {
                token,
                user: response.data
            };
            logger.info('Session restored', { userId: response.data.id, username: response.data.username });
            return true;
        } catch {
            // Token is invalid or expired
            error.value = 'Session expired. Please log in again.';
            logger.warn('Stored session expired');
            localStorage.removeItem('token');
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

    return {
        session,
        loading,
        error,
        isAuthenticated,
        currentUser,
        save,
        login,
        load,
        logout,
        clearError,
        updateProfile,
        changePassword
    };
});
