<script setup lang="ts">
import { ref, computed, toRaw } from 'vue';
import { clear } from 'idb-keyval';
import { useSessionStore } from '../stores/session';
import Button from 'primevue/button';
import Password from 'primevue/password';
import InputText from 'primevue/inputtext';
import MultiSelect from 'primevue/multiselect';
import UserAvatar from '../components/UserAvatar.vue';
import Panel from 'primevue/panel';
import ToggleSwitch from 'primevue/toggleswitch';

import { useToast } from 'primevue/usetoast';
import { useConfirm } from 'primevue/useconfirm';
import { onMounted } from 'vue';
import { notificationStorage } from '../services/notificationStorage';
import { NotificationLabel, type NotificationSettings } from '../types/Notification';
import { router } from '../router/router';
import { createLogger } from '../services/logger';
import api from '../services/API';
import { isPasskeySupported } from '../services/webauthn';
import { useUsersStore } from '../stores/users';
import { useUserGroupsStore } from '../stores/userGroups';
import { storeToRefs } from 'pinia';

const sessionStore = useSessionStore();
const toast = useToast();
const confirm = useConfirm();
const logger = createLogger('ProfileView');
const passkeySupported = isPasskeySupported();
const passkeys = ref<{ id: string; deviceName: string; createdAt: string }[]>([]);
const passkeyLoading = ref(false);
const usersStore = useUsersStore();
const userGroupsStore = useUserGroupsStore();
const { users } = storeToRefs(usersStore);
const { groups: userGroups, loading: groupsLoading } = storeToRefs(userGroupsStore);

const currentUser = computed(() => sessionStore.currentUser);
const isAdmin = computed(() => currentUser.value?.isAdmin);
const groupName = ref('');
const groupMembers = ref<number[]>([]);
const editingGroupId = ref<number | null>(null);
const groupEditorOpen = ref(false);
const groupSaving = ref(false);

const groupMemberOptions = computed(() => users.value.filter((user) => user.id !== currentUser.value?.id));

const startGroupEditor = (group?: (typeof userGroups.value)[number]) => {
    editingGroupId.value = group?.id ?? null;
    groupName.value = group?.name ?? '';
    groupMembers.value = group?.memberIds ?? [];
    groupEditorOpen.value = true;
};

const cancelGroupEditor = () => {
    groupEditorOpen.value = false;
    editingGroupId.value = null;
    groupName.value = '';
    groupMembers.value = [];
};

const saveGroup = async () => {
    const name = groupName.value.trim();
    if (!name) return;

    groupSaving.value = true;
    try {
        if (editingGroupId.value === null) {
            await userGroupsStore.createGroup({ name, memberIds: groupMembers.value });
            toast.add({ severity: 'success', summary: 'Invitation group created', life: 2500 });
        } else {
            await userGroupsStore.updateGroup(editingGroupId.value, { name, memberIds: groupMembers.value });
            toast.add({ severity: 'success', summary: 'Invitation group updated', life: 2500 });
        }
        cancelGroupEditor();
    } catch {
        toast.add({
            severity: 'error',
            summary: 'Could not save invitation group',
            detail: 'Please try again.',
            life: 3500
        });
    } finally {
        groupSaving.value = false;
    }
};

const deleteGroup = (group: (typeof userGroups.value)[number]) => {
    confirm.require({
        message: `Delete the "${group.name}" invitation group?`,
        header: 'Delete invitation group',
        rejectProps: { label: 'Cancel', severity: 'secondary', text: true },
        acceptProps: { label: 'Delete', severity: 'danger' },
        accept: async () => {
            try {
                await userGroupsStore.deleteGroup(group.id);
                if (editingGroupId.value === group.id) cancelGroupEditor();
                toast.add({ severity: 'success', summary: 'Invitation group deleted', life: 2500 });
            } catch {
                toast.add({
                    severity: 'error',
                    summary: 'Could not delete invitation group',
                    detail: 'Please try again.',
                    life: 3500
                });
            }
        }
    });
};

const handleLogout = async () => {
    await sessionStore.logout();
    router.push({ name: 'login' });
};

// Password Change State
const currentPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const passwordLoading = ref(false);

// Notification Settings State
const notificationSettings = ref<NotificationSettings | null>(null);

onMounted(async () => {
    notificationSettings.value = await notificationStorage.getSettings();
    await Promise.all([usersStore.fetchUsers(), userGroupsStore.fetchGroups()]);
    if (passkeySupported) {
        try {
            passkeys.value = (await api.getPasskeys()).data;
        } catch (error) {
            logger.warn('Failed to load passkeys', error);
        }
    }
});

const handleRegisterPasskey = async () => {
    passkeyLoading.value = true;
    try {
        const deviceName = window.prompt('Name this passkey', 'My device') || undefined;
        await sessionStore.registerPasskey(deviceName);
        passkeys.value = (await api.getPasskeys()).data;
        toast.add({
            severity: 'success',
            summary: 'Passkey added',
            detail: 'This device can now sign you in.',
            life: 3000
        });
    } catch (error: any) {
        toast.add({ severity: 'error', summary: 'Passkey registration failed', detail: error.message, life: 4000 });
    } finally {
        passkeyLoading.value = false;
    }
};

const handleDeletePasskey = async (id: string) => {
    try {
        await api.deletePasskey(id);
        passkeys.value = passkeys.value.filter((passkey) => passkey.id !== id);
        toast.add({ severity: 'success', summary: 'Passkey removed', life: 2500 });
    } catch (error: any) {
        toast.add({ severity: 'error', summary: 'Could not remove passkey', detail: error.message, life: 3500 });
    }
};

const handleToggleSetting = async () => {
    if (notificationSettings.value) {
        try {
            await notificationStorage.saveSettings(toRaw(notificationSettings.value));
        } catch (error) {
            logger.error('Failed to save notification settings', error);
            toast.add({
                severity: 'error',
                summary: 'Error',
                detail: 'Failed to save notification settings',
                life: 3000
            });
        }
    }
};

const handlePasswordChange = async () => {
    if (newPassword.value !== confirmPassword.value) {
        toast.add({ severity: 'error', summary: 'Error', detail: 'Passwords do not match', life: 3000 });
        return;
    }

    if (!currentPassword.value) {
        toast.add({ severity: 'error', summary: 'Error', detail: 'Current password is required', life: 3000 });
        return;
    }

    passwordLoading.value = true;
    try {
        await sessionStore.changePassword(currentPassword.value, newPassword.value);
        toast.add({ severity: 'success', summary: 'Success', detail: 'Password changed successfully', life: 3000 });
        // Reset form
        currentPassword.value = '';
        newPassword.value = '';
        confirmPassword.value = '';
    } catch {
        toast.add({ severity: 'error', summary: 'Error', detail: 'Failed to change password', life: 3000 });
    } finally {
        passwordLoading.value = false;
    }
};

const handleClearCache = () => {
    confirm.require({
        message:
            'This will delete the following locally cached data:\n- Weather forecast data\n- Geolocation (coordinates) cache\n\nThis action cannot be undone.',
        header: 'Clear Local Cache',
        rejectProps: {
            label: 'Cancel',
            severity: 'secondary',
            text: true
        },
        acceptProps: {
            label: 'Clear Cache',
            severity: 'danger'
        },
        accept: async () => {
            try {
                await clear();
                toast.add({
                    severity: 'success',
                    summary: 'Success',
                    detail: 'Weather and geolocation cache cleared',
                    life: 3000
                });
            } catch (error) {
                logger.error('Failed to clear IndexedDB cache', error);
                toast.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: 'Failed to clear cache',
                    life: 3000
                });
            }
        }
    });
};
</script>

<template>
    <div class="mx-auto max-w-2xl p-6 pb-20 lg:pt-2 lg:pb-6">
        <!-- Header Section -->
        <div class="relative mb-4 flex flex-col items-center">
            <div v-if="isAdmin" class="absolute top-0 right-0">
                <Button
                    icon="pi pi-shield"
                    severity="secondary"
                    variant="outlined"
                    @click="router.push({ name: 'admin' })"
                    class="p-button-xl"
                />
            </div>
            <h1 class="mb-4 text-4xl font-black tracking-tight">User Profile</h1>

            <div class="relative mt-4 h-25 w-25">
                <UserAvatar
                    :profilePictureUrl="currentUser?.profilePictureUrl"
                    :username="currentUser?.username"
                    class="h-full! w-full! border-4 border-zinc-800 text-3xl shadow-2xl"
                />
            </div>

            <div class="mt-6 text-center">
                <h2 class="text-2xl font-bold">{{ currentUser?.username }}</h2>
            </div>
        </div>

        <div class="space-y-4">
            <!-- Information Section -->
            <Panel
                class="bg-section border border-zinc-800/50! bg-zinc-950/40 shadow-2xl backdrop-blur-xl"
                :pt="{
                    header: { class: 'bg-transparent border-none px-6 py-5' },
                    content: { class: 'bg-transparent border-none px-6 pb-6 pt-0' }
                }"
            >
                <template #header>
                    <div class="flex items-center gap-2 text-xl font-bold">
                        <i class="pi pi-user text-primary"></i>
                        Personal Information
                    </div>
                </template>
                <div class="grid grid-cols-1 gap-6 pt-2">
                    <div class="flex flex-col gap-2">
                        <label class="text-xs font-bold tracking-widest text-zinc-500 uppercase">Username</label>
                        <div
                            class="flex items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3 text-lg"
                        >
                            <i class="pi pi-at text-sm text-zinc-500"></i>
                            <span>{{ currentUser?.username }}</span>
                        </div>
                    </div>
                </div>
            </Panel>

            <Panel
                class="bg-section border border-zinc-800/50! bg-zinc-950/40 shadow-2xl backdrop-blur-xl"
                :pt="{
                    header: { class: 'bg-transparent border-none px-6 py-5' },
                    content: { class: 'bg-transparent border-none px-6 pb-6 pt-0' }
                }"
            >
                <template #header>
                    <div class="flex w-full items-center justify-between gap-3">
                        <div class="flex items-center gap-2 text-xl font-bold">
                            <i class="pi pi-users text-primary"></i>
                            Invitation Groups
                        </div>
                        <Button
                            v-if="!groupEditorOpen"
                            icon="pi pi-plus"
                            label="New group"
                            size="small"
                            outlined
                            @click="startGroupEditor()"
                        />
                    </div>
                </template>

                <div class="flex flex-col gap-4 pt-2">
                    <p class="text-sm text-zinc-400">
                        Save recurring invite lists once, then apply them to any event in one click.
                    </p>

                    <div
                        v-if="groupEditorOpen"
                        class="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4"
                    >
                        <div class="flex items-center justify-between gap-3">
                            <h3 class="font-semibold">{{ editingGroupId === null ? 'Create group' : 'Edit group' }}</h3>
                            <Button
                                icon="pi pi-times"
                                text
                                rounded
                                aria-label="Close group editor"
                                @click="cancelGroupEditor"
                            />
                        </div>
                        <InputText v-model="groupName" placeholder="Group name" class="w-full rounded-xl!" autofocus />
                        <MultiSelect
                            v-model="groupMembers"
                            :options="groupMemberOptions"
                            optionLabel="username"
                            optionValue="id"
                            display="chip"
                            filter
                            placeholder="Choose people"
                            class="w-full rounded-xl!"
                        >
                            <template #option="slotProps">
                                <div class="flex items-center gap-2">
                                    <UserAvatar
                                        :profilePictureUrl="slotProps.option.profilePictureUrl"
                                        :username="slotProps.option.username"
                                    />
                                    <span>{{ slotProps.option.username }}</span>
                                </div>
                            </template>
                            <template #chip="slotProps">
                                <div class="flex items-center gap-1 px-1">
                                    <UserAvatar
                                        :profilePictureUrl="
                                            groupMemberOptions.find((user) => user.id === slotProps.value)
                                                ?.profilePictureUrl
                                        "
                                        :username="
                                            groupMemberOptions.find((user) => user.id === slotProps.value)?.username
                                        "
                                        class="h-4! w-4! text-[10px]!"
                                    />
                                    <span>{{
                                        groupMemberOptions.find((user) => user.id === slotProps.value)?.username
                                    }}</span>
                                </div>
                            </template>
                        </MultiSelect>
                        <div class="flex justify-end gap-2">
                            <Button label="Cancel" text severity="secondary" @click="cancelGroupEditor" />
                            <Button
                                label="Save group"
                                icon="pi pi-check"
                                :loading="groupSaving"
                                :disabled="!groupName.trim()"
                                @click="saveGroup"
                            />
                        </div>
                    </div>

                    <div v-if="groupsLoading" class="text-sm text-zinc-500">Loading invitation groups...</div>
                    <div
                        v-else-if="userGroups.length"
                        class="divide-y divide-zinc-800 rounded-xl border border-zinc-800"
                    >
                        <div
                            v-for="group in userGroups"
                            :key="group.id"
                            class="flex items-center justify-between gap-3 p-3"
                        >
                            <div class="min-w-0">
                                <div class="truncate font-medium">{{ group.name }}</div>
                                <div class="text-xs text-zinc-500">
                                    {{ group.memberIds.length }}
                                    {{ group.memberIds.length === 1 ? 'person' : 'people' }}
                                </div>
                            </div>
                            <div class="flex shrink-0 items-center gap-1">
                                <Button
                                    icon="pi pi-pencil"
                                    text
                                    rounded
                                    aria-label="Edit invitation group"
                                    @click="startGroupEditor(group)"
                                />
                                <Button
                                    icon="pi pi-trash"
                                    text
                                    rounded
                                    severity="danger"
                                    aria-label="Delete invitation group"
                                    @click="deleteGroup(group)"
                                />
                            </div>
                        </div>
                    </div>
                    <p v-else class="text-sm text-zinc-500">
                        No invitation groups yet. Create one for your regular invite lists.
                    </p>
                </div>
            </Panel>

            <!-- Security Section -->
            <Panel
                class="bg-section border border-zinc-800/50! bg-zinc-950/40 shadow-2xl backdrop-blur-xl"
                :pt="{
                    header: { class: 'bg-transparent border-none px-6 py-5' },
                    content: { class: 'bg-transparent border-none px-6 pb-6 pt-0' }
                }"
            >
                <template #header>
                    <div class="flex items-center gap-2 text-xl font-bold">
                        <i class="pi pi-lock text-primary"></i>
                        Security
                    </div>
                </template>
                <form @submit.prevent="handlePasswordChange" class="flex flex-col gap-6 pt-2">
                    <div class="flex flex-col gap-1.5">
                        <label for="current-password" class="text-xs font-bold tracking-widest text-zinc-500 uppercase"
                            >Current Password</label
                        >
                        <Password
                            id="current-password"
                            v-model="currentPassword"
                            toggleMask
                            :feedback="false"
                            class="w-full"
                            inputClass="w-full p-3 bg-zinc-900/50 border-zinc-800"
                            placeholder="••••••••"
                            :inputProps="{ autocomplete: 'current-password' }"
                        />
                    </div>

                    <div class="grid grid-cols-1 gap-6 md:grid-cols-2">
                        <div class="flex flex-col gap-1.5">
                            <label for="new-password" class="text-xs font-bold tracking-widest text-zinc-500 uppercase"
                                >New Password</label
                            >
                            <Password
                                id="new-password"
                                v-model="newPassword"
                                toggleMask
                                class="w-full"
                                inputClass="w-full p-3 bg-zinc-900/50 border-zinc-800"
                                placeholder="••••••••"
                                :inputProps="{ autocomplete: 'new-password' }"
                            />
                        </div>

                        <div class="flex flex-col gap-1.5">
                            <label
                                for="confirm-password"
                                class="text-xs font-bold tracking-widest text-zinc-500 uppercase"
                                >Confirm Password</label
                            >
                            <Password
                                id="confirm-password"
                                v-model="confirmPassword"
                                toggleMask
                                :feedback="false"
                                class="w-full"
                                inputClass="w-full p-3 bg-zinc-900/50 border-zinc-800"
                                placeholder="••••••••"
                                :inputProps="{ autocomplete: 'new-password' }"
                            />
                        </div>
                    </div>

                    <div class="pt-2">
                        <Button
                            type="submit"
                            label="Update Password"
                            icon="pi pi-shield"
                            :loading="passwordLoading"
                            class="w-full py-3 font-bold"
                        />
                    </div>
                </form>
            </Panel>

            <Panel
                v-if="passkeySupported"
                class="bg-section border border-zinc-800/50! bg-zinc-950/40 shadow-2xl backdrop-blur-xl"
                :pt="{
                    header: { class: 'bg-transparent border-none px-6 py-5' },
                    content: { class: 'bg-transparent border-none px-6 pb-6 pt-0' }
                }"
            >
                <template #header>
                    <div class="flex items-center gap-2 text-xl font-bold">
                        <i class="pi pi-key text-primary"></i>
                        Passkeys &amp; Biometrics
                    </div>
                </template>
                <div class="flex flex-col gap-3 pt-2">
                    <Button
                        label="Register this device"
                        icon="pi pi-plus"
                        :loading="passkeyLoading"
                        @click="handleRegisterPasskey"
                    />
                    <div v-if="passkeys.length" class="divide-y divide-zinc-800 rounded-lg border border-zinc-800">
                        <div
                            v-for="passkey in passkeys"
                            :key="passkey.id"
                            class="flex items-center justify-between gap-3 p-3"
                        >
                            <div class="min-w-0">
                                <div class="truncate font-medium">{{ passkey.deviceName }}</div>
                                <div class="text-xs text-zinc-500">
                                    Added {{ new Date(passkey.createdAt).toLocaleDateString() }}
                                </div>
                            </div>
                            <Button
                                icon="pi pi-trash"
                                severity="danger"
                                text
                                rounded
                                aria-label="Remove passkey"
                                @click="handleDeletePasskey(passkey.id)"
                            />
                        </div>
                    </div>
                    <p v-else class="text-sm text-zinc-500">No passkeys registered yet.</p>
                </div>
            </Panel>

            <!-- Notification Preferences Section -->
            <Panel
                v-if="notificationSettings"
                header="Notification Preferences"
                toggleable
                :collapsed="true"
                class="bg-section overflow-hidden border border-zinc-800/50! bg-zinc-950/40 shadow-2xl backdrop-blur-xl"
                :pt="{
                    header: { class: 'bg-transparent border-none px-6 py-5' },
                    content: { class: 'bg-transparent border-none px-6 pb-6 pt-0' },
                    toggleableContent: { class: 'bg-transparent' },
                    toggler: { class: 'bg-transparent hover:bg-white/10 text-zinc-400 border-none' }
                }"
            >
                <template #header>
                    <div class="flex items-center gap-2 text-xl font-bold">
                        <i class="pi pi-bell text-primary"></i>
                        <span>Notification Preferences</span>
                    </div>
                </template>

                <div class="flex flex-col gap-4 pt-2">
                    <p class="mb-2 text-sm text-zinc-400">
                        Choose which notifications you would like to receive. These filters are applied locally on this
                        device.
                    </p>

                    <div
                        v-for="(label, code) in NotificationLabel"
                        :key="code"
                        class="flex items-center justify-between rounded-xl border border-zinc-800/50 bg-zinc-900/30 p-4 transition-colors hover:bg-zinc-900/50"
                    >
                        <div class="flex flex-col gap-0.5">
                            <span class="font-medium">{{ label }}</span>
                            <span class="font-mono text-xs tracking-tighter text-zinc-500 uppercase opacity-70">{{
                                code
                            }}</span>
                        </div>
                        <ToggleSwitch v-model="notificationSettings[code]" @change="handleToggleSetting" />
                    </div>
                </div>
            </Panel>

            <!-- Cache Management Section -->
            <Button
                label="Clear Cache"
                icon="pi pi-trash"
                severity="danger"
                outlined
                class="w-full"
                @click="handleClearCache"
            />

            <!-- Logout Section -->
            <Button label="Logout" icon="pi pi-sign-out" severity="danger" class="w-full" @click="handleLogout" />
        </div>
    </div>
</template>

<style scoped>
.bg-section {
    background: linear-gradient(145deg, rgba(9, 9, 11, 0.4) 0%, rgba(0, 0, 0, 0.6) 100%);
}

.bg-primary {
    background-color: var(--p-primary-color);
}

.text-primary {
    color: var(--p-primary-color);
}
</style>
