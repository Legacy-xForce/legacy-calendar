<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { FilterMatchMode } from '@primevue/core/api';
import type { User } from '../types/User';
import { useToast } from 'primevue/usetoast';
import { useConfirm } from 'primevue/useconfirm';
import { useUsersStore } from '../stores/users';
import { storeToRefs } from 'pinia';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import DataTable from 'primevue/datatable';
import Column from 'primevue/column';
import Tag from 'primevue/tag';
import UserAvatar from '../components/UserAvatar.vue';
import IconField from 'primevue/iconfield';
import InputIcon from 'primevue/inputicon';

const toast = useToast();
const confirm = useConfirm();
const usersStore = useUsersStore();
const { users, loading } = storeToRefs(usersStore);
const { fetchUsers, removeUser } = usersStore;

const filters = ref({
    global: { value: null, matchMode: FilterMatchMode.CONTAINS }
});

const handleDeleteUser = async (id: number) => {
    try {
        await removeUser(id);
        toast.add({
            severity: 'success',
            summary: 'Success',
            detail: 'User deleted successfully',
            life: 3000
        });
    } catch (err: any) {
        toast.add({
            severity: 'error',
            summary: 'Error',
            detail: err.message || 'Failed to delete user',
            life: 3000
        });
    }
};

const confirmDelete = (user: User) => {
    confirm.require({
        message: `Are you sure you want to delete user "${user.username}"? This action cannot be undone.`,
        header: 'Confirm Deletion',
        icon: 'pi pi-exclamation-triangle',
        rejectProps: {
            label: 'Cancel',
            severity: 'secondary',
            outlined: true
        },
        acceptProps: {
            label: 'Delete',
            severity: 'danger'
        },
        accept: () => {
            handleDeleteUser(user.id);
        }
    });
};

const impersonateUser = (user: User) => {
    localStorage.setItem('impersonate_user_id', user.id.toString());
    window.location.href = '/calendar';
};

onMounted(() => {
    fetchUsers();
});
</script>

<template>
    <div class="mx-auto mb-16 flex w-full max-w-7xl flex-col gap-8 p-4">
        <div class="animate-in fade-in flex flex-col gap-2 duration-500">
            <div class="flex flex-1 flex-col items-start justify-between gap-6 md:flex-row md:items-center">
                <div>
                    <h1 class="text-surface-0 mb-1 text-3xl font-black tracking-tight uppercase">User Management</h1>
                    <p class="text-surface-400">Manage system users, access levels, and credentials.</p>
                </div>
            </div>

            <div class="bg-surface-950/50 overflow-hidden rounded-2xl border border-zinc-800 shadow-sm">
                <DataTable
                    v-model:filters="filters"
                    :value="users"
                    :loading="loading"
                    class="p-datatable-lg border-none"
                    responsiveLayout="scroll"
                    sortField="username"
                    :sortOrder="1"
                    :globalFilterFields="['username', 'id']"
                    :pt="{
                        header: { class: '!bg-transparent !border-b !border-zinc-800 p-0' },
                        bodyRow: { class: 'hover:!bg-zinc-900/40 transition-colors' }
                    }"
                >
                    <template #header>
                        <IconField class="w-full">
                            <InputIcon class="pi pi-search" />
                            <InputText
                                v-model="filters['global'].value"
                                placeholder="Search by name or ID..."
                                class="w-full border-zinc-800! bg-zinc-900/20!"
                            />
                        </IconField>
                    </template>
                    <Column field="id" header="ID" class="text-surface-500 w-24" sortable></Column>
                    <Column header="User" class="text-surface-0 font-semibold" sortable sortField="username">
                        <template #body="slotProps">
                            <div class="flex items-center gap-3">
                                <UserAvatar
                                    :profilePictureUrl="slotProps.data.profilePictureUrl"
                                    :username="slotProps.data.username"
                                    size="large"
                                />
                                <span>{{ slotProps.data.username }}</span>
                            </div>
                        </template>
                    </Column>
                    <Column header="Role" class="w-32">
                        <template #body="slotProps">
                            <Tag
                                :value="slotProps.data.isAdmin ? 'ADMIN' : 'USER'"
                                :severity="slotProps.data.isAdmin ? 'success' : 'secondary'"
                                class="font-bold tracking-widest"
                            />
                        </template>
                    </Column>
                    <Column header="Actions" class="w-32 text-right">
                        <template #body="slotProps">
                            <div class="flex items-center justify-end gap-1">
                                <Button
                                    icon="pi pi-user-edit"
                                    text
                                    rounded
                                    severity="info"
                                    @click="impersonateUser(slotProps.data)"
                                    v-tooltip.top="'Impersonate User'"
                                    class="h-10! w-10!"
                                />
                                <Button
                                    icon="pi pi-trash"
                                    text
                                    rounded
                                    severity="danger"
                                    @click="confirmDelete(slotProps.data)"
                                    v-tooltip.top="'Delete User'"
                                    class="h-10! w-10!"
                                />
                            </div>
                        </template>
                    </Column>
                    <template #empty>
                        <div class="text-surface-500 flex flex-col items-center justify-center p-12">
                            <i class="pi pi-users mb-4" style="font-size: 2rem"></i>
                            <p>No users found in the system registry.</p>
                        </div>
                    </template>
                </DataTable>
            </div>
        </div>
    </div>
</template>
