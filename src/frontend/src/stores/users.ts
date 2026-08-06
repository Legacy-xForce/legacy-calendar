import { defineStore } from 'pinia';
import { ref } from 'vue';
import api from '../services/API';
import type { User, CreateUserDto, UpdateUserDto } from '../types/User';
import { createLogger } from '../services/logger';

const logger = createLogger('UsersStore');

export const useUsersStore = defineStore('users', () => {
    const users = ref<User[]>([]);
    const loading = ref(false);
    const error = ref<string | null>(null);
    const lastFetched = ref<number | null>(null);
    const CACHE_TTL = 1000 * 60 * 5; // 5 minutes

    let fetchPromise: Promise<User[]> | null = null;

    async function fetchUsers(force = false) {
        if (!force && lastFetched.value && Date.now() - lastFetched.value < CACHE_TTL) {
            logger.trace('Returning cached users list');
            return users.value;
        }

        if (fetchPromise) return fetchPromise;

        fetchPromise = (async () => {
            loading.value = true;
            error.value = null;
            try {
                logger.info('Fetching users');
                const response = await api.findAllUsers();
                users.value = response.data;
                lastFetched.value = Date.now();
                logger.info('Users loaded', { count: users.value.length });
                return users.value;
            } catch (err: any) {
                error.value = err.response?.data?.message || 'Failed to fetch users';
                logger.warn('Failed to fetch users', {
                    status: err.response?.status,
                    message: err.response?.data?.message ?? err.message
                });
                return [];
            } finally {
                loading.value = false;
                fetchPromise = null;
            }
        })();

        return fetchPromise;
    }

    async function createUser(dto: CreateUserDto) {
        logger.info('Creating user', { username: dto.username });
        const response = await api.createUser(dto);
        await fetchUsers(true);
        logger.info('User created', { userId: response.data.id, username: response.data.username });
        return response.data;
    }

    async function updateUser(id: number, dto: UpdateUserDto) {
        logger.info('Updating user', { userId: id });
        const response = await api.updateUser(id, dto);
        await fetchUsers(true);
        logger.info('User updated', { userId: id });
        return response.data;
    }

    async function removeUser(id: number) {
        logger.warn('Removing user', { userId: id });
        await api.removeUser(id);
        await fetchUsers(true);
    }

    function clearCache() {
        users.value = [];
        lastFetched.value = null;
    }

    return {
        users,
        loading,
        error,
        fetchUsers,
        createUser,
        updateUser,
        removeUser,
        clearCache
    };
});
