import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { UserGroup, CreateUserGroupDto, UpdateUserGroupDto } from '../types/UserGroup';
import api from '../services/API';
import { createLogger } from '../services/logger';

const logger = createLogger('UserGroupsStore');

export const useUserGroupsStore = defineStore('userGroups', () => {
    const groups = ref<UserGroup[]>([]);
    const loading = ref(false);
    const error = ref<string | null>(null);

    async function fetchGroups() {
        loading.value = true;
        error.value = null;
        try {
            const res = await api.getUserGroups();
            groups.value = res.data;
            return groups.value;
        } catch (err: any) {
            error.value = err.response?.data?.message || 'Failed to fetch user groups';
            logger.error('Failed to fetch user groups', err);
            return [];
        } finally {
            loading.value = false;
        }
    }

    async function createGroup(dto: CreateUserGroupDto) {
        loading.value = true;
        error.value = null;
        try {
            const res = await api.createUserGroup(dto);
            groups.value.push(res.data);
            groups.value.sort((a, b) => a.name.localeCompare(b.name));
            return res.data;
        } catch (err: any) {
            error.value = err.response?.data?.message || 'Failed to create user group';
            logger.error('Failed to create user group', err);
            throw err;
        } finally {
            loading.value = false;
        }
    }

    async function updateGroup(id: number, dto: UpdateUserGroupDto) {
        loading.value = true;
        error.value = null;
        try {
            const res = await api.updateUserGroup(id, dto);
            const index = groups.value.findIndex((g) => g.id === id);
            if (index !== -1) {
                groups.value[index] = res.data;
                groups.value.sort((a, b) => a.name.localeCompare(b.name));
            }
            return res.data;
        } catch (err: any) {
            error.value = err.response?.data?.message || 'Failed to update user group';
            logger.error('Failed to update user group', err);
            throw err;
        } finally {
            loading.value = false;
        }
    }

    async function deleteGroup(id: number) {
        loading.value = true;
        error.value = null;
        try {
            await api.deleteUserGroup(id);
            groups.value = groups.value.filter((g) => g.id !== id);
        } catch (err: any) {
            error.value = err.response?.data?.message || 'Failed to delete user group';
            logger.error('Failed to delete user group', err);
            throw err;
        } finally {
            loading.value = false;
        }
    }

    return {
        groups,
        loading,
        error,
        fetchGroups,
        createGroup,
        updateGroup,
        deleteGroup
    };
});
