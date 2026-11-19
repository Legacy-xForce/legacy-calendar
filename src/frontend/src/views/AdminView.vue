<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import type { User } from '../types/User';
import { useToast } from 'primevue/usetoast';
import { useUsersStore } from '../stores/users';
import { useSessionStore } from '../stores/session';
import { storeToRefs } from 'pinia';
import Button from 'primevue/button';
import SelectButton from 'primevue/selectbutton';
import InputText from 'primevue/inputtext';
import FeaturesAdminSection from '../components/FeaturesAdminSection.vue';
import UserAvatar from '../components/UserAvatar.vue';
import IconField from 'primevue/iconfield';
import InputIcon from 'primevue/inputicon';

const toast = useToast();
const usersStore = useUsersStore();
const { users, loading } = storeToRefs(usersStore);
const { fetchUsers, updateUser } = usersStore;
const sessionStore = useSessionStore();
const { currentUser } = storeToRefs(sessionStore);

const ROLE_OPTIONS = [
    { label: 'User', value: false },
    { label: 'Admin', value: true }
];

const search = ref('');
const togglingAdminIds = ref<number[]>([]);

const isSelf = (user: User) => currentUser.value?.id === user.id;

const setAdminStatus = async (user: User, isAdmin: boolean) => {
    if (isSelf(user) || isAdmin === user.isAdmin || togglingAdminIds.value.includes(user.id)) return;

    togglingAdminIds.value.push(user.id);
    try {
        await updateUser(user.id, { isAdmin });
        toast.add({
            severity: 'success',
            summary: isAdmin ? `${user.username} is now an admin` : `${user.username} is no longer an admin`,
            life: 3000
        });
    } catch (err: any) {
        toast.add({
            severity: 'error',
            summary: "Couldn't update admin status",
            detail: err.response?.data?.message || err.message || 'Please try again.',
            life: 3000
        });
    } finally {
        togglingAdminIds.value = togglingAdminIds.value.filter((id) => id !== user.id);
    }
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
    <div class="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-6 pb-10 md:pt-10 lg:max-w-6xl">
        <header>
            <h1 class="text-display m-0">Settings</h1>
            <p class="text-meta text-muted m-0 mt-1">Instance-wide settings, visible to administrators only.</p>
        </header>

        <div class="grid grid-cols-1 items-start gap-6 lg:grid-cols-2 lg:gap-8">
            <FeaturesAdminSection />

            <div class="flex flex-col gap-6">
                <div>
                    <h2 class="text-headline m-0">Users</h2>
                    <p class="text-meta text-muted tabular m-0 mt-1">
                        {{ users.length }} accounts · managed in Legacy accounts
                    </p>
                </div>

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
                        <UserAvatar
                            :profilePictureUrl="user.profilePictureUrl"
                            :username="user.username"
                            class="size-9!"
                        />
                        <div class="min-w-0 flex-1">
                            <p class="text-body text-fg m-0 truncate font-medium">{{ user.username }}</p>
                            <p class="text-meta text-subtle tabular m-0">#{{ user.id }}</p>
                        </div>
                        <div class="flex shrink-0 items-center gap-2">
                            <Button
                                icon="pi pi-eye"
                                text
                                rounded
                                severity="secondary"
                                :aria-label="`View the app as ${user.username}`"
                                v-tooltip.top="'View as this user'"
                                @click="impersonateUser(user)"
                            />
                            <div
                                class="flex items-center"
                                v-tooltip.top="
                                    isSelf(user)
                                        ? 'You cannot change your own admin status'
                                        : 'Change access level for this user'
                                "
                            >
                                <SelectButton
                                    :modelValue="user.isAdmin"
                                    :options="ROLE_OPTIONS"
                                    optionLabel="label"
                                    optionValue="value"
                                    :allowEmpty="false"
                                    :disabled="isSelf(user) || togglingAdminIds.includes(user.id)"
                                    :aria-label="`Access level for ${user.username}`"
                                    @update:modelValue="(value: boolean) => setAdminStatus(user, value)"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <p v-else class="text-body text-muted py-12 text-center">No users match that search.</p>
            </div>
        </div>
    </div>
</template>
