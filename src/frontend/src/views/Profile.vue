<script setup lang="ts">
import { ref, computed, toRaw } from 'vue';
import { clear } from 'idb-keyval';
import { useSessionStore } from '../stores/session';
import Button from 'primevue/button';
import Password from 'primevue/password';
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

const sessionStore = useSessionStore();
const toast = useToast();
const confirm = useConfirm();
const logger = createLogger('ProfileView');

const currentUser = computed(() => sessionStore.currentUser);
const isAdmin = computed(() => currentUser.value?.isAdmin);

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
});

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

            <div class="relative mt-4 h-[100px] w-[100px]">
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
