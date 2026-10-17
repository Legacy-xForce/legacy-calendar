<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import type { User } from '../types/User';
import { useToast } from 'primevue/usetoast';
import { useConfirm } from 'primevue/useconfirm';
import { useUsersStore } from '../stores/users';
import { storeToRefs } from 'pinia';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import UserAvatar from '../components/UserAvatar.vue';
import IconField from 'primevue/iconfield';
import InputIcon from 'primevue/inputicon';

const toast = useToast();
const confirm = useConfirm();
const usersStore = useUsersStore();
const { users, loading } = storeToRefs(usersStore);
const { fetchUsers, removeUser } = usersStore;

const search = ref('');

const handleDeleteUser = async (user: User) => {
    try {
        await removeUser(user.id);
        toast.add({ severity: 'success', summary: `${user.username} deleted`, life: 3000 });
    } catch (err: any) {
        toast.add({
            severity: 'error',
            summary: "Couldn't delete user",
            detail: err.message || 'Please try again.',
            life: 3000
        });
    }
};

const confirmDelete = (user: User) => {
    confirm.require({
        message: `${user.username} will lose access and disappear from events. This can't be undone.`,
        header: `Delete ${user.username}?`,
        icon: 'pi pi-exclamation-triangle',
        rejectProps: { label: 'Cancel', severity: 'secondary', text: true },
        acceptProps: { label: 'Delete', severity: 'danger' },
        accept: () => handleDeleteUser(user)
    });
};

const impersonateUser = (user: User) => {
    localStorage.setItem('impersonate_user_id', user.id.toString());
    window.location.href = '/calendar';
};

const filteredUsers = computed(() => {
    const query = search.value.trim().toLowerCase();
    const sorted = [...users.value].sort((a, b) => a.username.localeCompare(b.username));
    if (!query) return sorted;
    return sorted.filter((user) => user.username.toLowerCase().includes(query) || String(user.id) === query);
});

onMounted(() => {
    fetchUsers();
});
</script>

<template>
    <div class="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-6 pb-10 md:pt-10">
        <header>
            <router-link
                :to="{ name: 'profile' }"
                class="text-meta text-muted hover:text-fg mb-2 inline-flex items-center gap-1.5 no-underline"
            >
                <i class="pi pi-arrow-left text-[0.625rem]"></i>
                Profile
            </router-link>
            <h1 class="text-display m-0">Users</h1>
            <p class="text-meta text-muted tabular m-0 mt-1">
                {{ users.length }} accounts · managed in Legacy accounts
            </p>
        </header>

        <IconField>
            <InputIcon class="pi pi-search" />
            <InputText v-model="search" placeholder="Search by name or ID" aria-label="Search users" fluid />
        </IconField>

        <div v-if="loading && !users.length" class="text-muted flex justify-center py-12">
            <i class="pi pi-spin pi-spinner"></i>
        </div>

        <div
            v-else-if="filteredUsers.length"
            class="border-line bg-raised divide-line divide-y overflow-hidden rounded-2xl border"
        >
            <div v-for="user in filteredUsers" :key="user.id" class="flex items-center gap-3 px-4 py-2.5">
                <UserAvatar :profilePictureUrl="user.profilePictureUrl" :username="user.username" class="size-9!" />
                <div class="min-w-0 flex-1">
                    <p class="text-body text-fg m-0 flex items-center gap-2 truncate font-medium">
                        {{ user.username }}
                        <span
                            v-if="user.isAdmin"
                            class="bg-surface-850 text-muted rounded-full px-2 py-0.5 text-[0.6875rem] font-medium"
                        >
                            Admin
                        </span>
                    </p>
                    <p class="text-meta text-subtle tabular m-0">#{{ user.id }}</p>
                </div>
                <div class="flex shrink-0 items-center">
                    <Button
                        icon="pi pi-eye"
                        text
                        rounded
                        severity="secondary"
                        :aria-label="`View the app as ${user.username}`"
                        v-tooltip.top="'View as this user'"
                        @click="impersonateUser(user)"
                    />
                    <Button
                        icon="pi pi-trash"
                        text
                        rounded
                        severity="danger"
                        :aria-label="`Delete ${user.username}`"
                        v-tooltip.top="'Delete'"
                        @click="confirmDelete(user)"
                    />
                </div>
            </div>
        </div>

        <p v-else class="text-body text-muted py-12 text-center">No users match that search.</p>
    </div>
</template>
