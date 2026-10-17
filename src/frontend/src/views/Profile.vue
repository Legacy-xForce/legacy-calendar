<script setup lang="ts">
import { ref, computed, toRaw, onMounted } from 'vue';
import { clear } from 'idb-keyval';
import { useSessionStore } from '../stores/session';
import Button from 'primevue/button';
import Password from 'primevue/password';
import ToggleSwitch from 'primevue/toggleswitch';
import SelectButton from 'primevue/selectbutton';
import { storeToRefs } from 'pinia';
import { usePreferencesStore, type MobileCalendarLayout } from '../stores/preferences';
import UserAvatar from '../components/UserAvatar.vue';
import { useToast } from 'primevue/usetoast';
import { useConfirm } from 'primevue/useconfirm';
import { notificationStorage } from '../services/notificationStorage';
import { NotificationCode, type NotificationSettings } from '../types/Notification';
import { router } from '../router/router';
import { createLogger } from '../services/logger';

const sessionStore = useSessionStore();
const toast = useToast();
const confirm = useConfirm();
const logger = createLogger('ProfileView');

const { mobileCalendarLayout } = storeToRefs(usePreferencesStore());

const calendarLayouts: { value: MobileCalendarLayout; label: string; icon: string; hint: string }[] = [
    {
        value: 'agenda',
        label: 'Agenda',
        icon: 'pi pi-list',
        hint: "A compact month with dots, and the selected day's events listed below."
    },
    {
        value: 'grid',
        label: 'Month grid',
        icon: 'pi pi-th-large',
        hint: 'The whole month on screen, with event titles inside each day.'
    }
];
const calendarLayoutHint = computed(
    () => calendarLayouts.find((layout) => layout.value === mobileCalendarLayout.value)?.hint
);

const currentUser = computed(() => sessionStore.currentUser);
const isAdmin = computed(() => currentUser.value?.isAdmin);

const notificationGroups: { title: string; items: { code: NotificationCode; label: string; hint?: string }[] }[] = [
    {
        title: 'Events',
        items: [
            { code: NotificationCode.INVITATION_NEW, label: 'Invitations', hint: 'Someone invites you' },
            { code: NotificationCode.EVENT_CREATED, label: 'New events', hint: 'An open event is planned' },
            { code: NotificationCode.EVENT_UPDATED, label: 'Event changes', hint: 'Time, place or details change' },
            { code: NotificationCode.EVENT_CANCELLED, label: 'Cancellations' },
            { code: NotificationCode.RIDE_ASSIGNED, label: 'Rides', hint: 'You get a seat in a car' },
            { code: NotificationCode.CHAT_NEW_MESSAGE, label: 'Chat messages' }
        ]
    },
    {
        title: 'When you host',
        items: [
            { code: NotificationCode.PARTICIPATION_ACCEPTED, label: 'Someone joins' },
            { code: NotificationCode.PARTICIPATION_UPDATED, label: 'Someone changes their choices' },
            { code: NotificationCode.PARTICIPATION_CANCELLED, label: 'Someone leaves' }
        ]
    }
];

const handleLogout = async () => {
    await sessionStore.logout();
    router.push({ name: 'login' });
};

// Password change
const showPasswordForm = ref(false);
const currentPassword = ref('');
const newPassword = ref('');
const confirmPassword = ref('');
const passwordLoading = ref(false);
const passwordSubmitted = ref(false);

const passwordError = computed(() => {
    if (!currentPassword.value) return 'Enter your current password.';
    if (!newPassword.value) return 'Choose a new password.';
    if (newPassword.value !== confirmPassword.value) return "The new passwords don't match.";
    return null;
});

const notificationSettings = ref<NotificationSettings | null>(null);

onMounted(async () => {
    notificationSettings.value = await notificationStorage.getSettings();
});

const handleToggleSetting = async () => {
    if (!notificationSettings.value) return;
    try {
        await notificationStorage.saveSettings(toRaw(notificationSettings.value));
    } catch (error) {
        logger.error('Failed to save notification settings', error);
        toast.add({ severity: 'error', summary: "Couldn't save notification settings", life: 3000 });
    }
};

const handlePasswordChange = async () => {
    passwordSubmitted.value = true;
    if (passwordError.value) return;

    passwordLoading.value = true;
    try {
        await sessionStore.changePassword(currentPassword.value, newPassword.value);
        toast.add({ severity: 'success', summary: 'Password updated', life: 3000 });
        currentPassword.value = '';
        newPassword.value = '';
        confirmPassword.value = '';
        passwordSubmitted.value = false;
        showPasswordForm.value = false;
    } catch {
        toast.add({
            severity: 'error',
            summary: "Couldn't update password",
            detail: 'Check your current password and try again.',
            life: 4000
        });
    } finally {
        passwordLoading.value = false;
    }
};

const handleClearCache = () => {
    confirm.require({
        message: 'Weather forecasts and map locations saved on this device will be downloaded again when needed.',
        header: 'Clear cached data?',
        rejectProps: { label: 'Cancel', severity: 'secondary', text: true },
        acceptProps: { label: 'Clear', severity: 'danger' },
        accept: async () => {
            try {
                await clear();
                toast.add({ severity: 'success', summary: 'Cache cleared', life: 2500 });
            } catch (error) {
                logger.error('Failed to clear IndexedDB cache', error);
                toast.add({ severity: 'error', summary: "Couldn't clear the cache", life: 3000 });
            }
        }
    });
};
</script>

<template>
    <div class="mx-auto flex w-full max-w-xl flex-col gap-8 px-4 pt-6 pb-10 md:pt-10">
        <header class="flex items-center gap-4">
            <UserAvatar
                :profilePictureUrl="currentUser?.profilePictureUrl"
                :username="currentUser?.username"
                class="size-16! text-xl!"
            />
            <div class="min-w-0">
                <h1 class="text-display m-0 truncate">{{ currentUser?.username }}</h1>
                <p class="text-meta text-muted m-0">{{ isAdmin ? 'Administrator' : 'Member' }}</p>
            </div>
        </header>

        <section class="flex flex-col gap-2">
            <div>
                <h2 class="eyebrow m-0">Calendar</h2>
                <p class="text-meta text-subtle m-0 mt-1">Layout on phones. Saved on this device only.</p>
            </div>
            <SelectButton
                v-model="mobileCalendarLayout"
                :options="calendarLayouts"
                optionLabel="label"
                optionValue="value"
                :allowEmpty="false"
                fluid
                aria-label="Calendar layout on phones"
            >
                <template #option="slotProps">
                    <span class="flex items-center gap-2">
                        <i :class="slotProps.option.icon" class="text-xs"></i>
                        <span class="text-meta font-medium">{{ slotProps.option.label }}</span>
                    </span>
                </template>
            </SelectButton>
            <p class="text-meta text-muted m-0">{{ calendarLayoutHint }}</p>
        </section>

        <section v-if="notificationSettings" class="flex flex-col gap-4">
            <div>
                <h2 class="eyebrow m-0">Notifications</h2>
                <p class="text-meta text-subtle m-0 mt-1">Saved on this device only.</p>
            </div>
            <div v-for="group in notificationGroups" :key="group.title" class="flex flex-col gap-2">
                <h3 class="text-meta text-muted m-0 font-medium">{{ group.title }}</h3>
                <div class="border-line bg-raised divide-line divide-y overflow-hidden rounded-2xl border">
                    <label
                        v-for="item in group.items"
                        :key="item.code"
                        :for="`notify-${item.code}`"
                        class="flex cursor-pointer items-center justify-between gap-4 px-4 py-3"
                    >
                        <span class="min-w-0">
                            <span class="text-body text-fg block font-medium">{{ item.label }}</span>
                            <span v-if="item.hint" class="text-meta text-muted block">{{ item.hint }}</span>
                        </span>
                        <ToggleSwitch
                            :inputId="`notify-${item.code}`"
                            v-model="notificationSettings[item.code]"
                            @change="handleToggleSetting"
                        />
                    </label>
                </div>
            </div>
        </section>

        <section class="flex flex-col gap-2">
            <h2 class="eyebrow m-0">Account</h2>
            <div class="border-line bg-raised divide-line divide-y overflow-hidden rounded-2xl border">
                <button
                    type="button"
                    class="hover:bg-surface-950 flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors"
                    :aria-expanded="showPasswordForm"
                    @click="showPasswordForm = !showPasswordForm"
                >
                    <span class="bg-surface-900 text-muted flex size-9 shrink-0 items-center justify-center rounded-xl">
                        <i class="pi pi-key text-sm"></i>
                    </span>
                    <span class="text-body text-fg flex-1 font-medium">Change password</span>
                    <i
                        class="pi pi-chevron-down text-subtle text-xs transition-transform duration-200"
                        :class="{ 'rotate-180': showPasswordForm }"
                    ></i>
                </button>

                <form
                    v-if="showPasswordForm"
                    class="animate-rise-in flex flex-col gap-3 px-4 pt-2 pb-4"
                    novalidate
                    @submit.prevent="handlePasswordChange"
                >
                    <div class="flex flex-col gap-1.5">
                        <label for="current-password" class="text-meta text-muted font-medium">Current password</label>
                        <Password
                            inputId="current-password"
                            v-model="currentPassword"
                            toggleMask
                            :feedback="false"
                            fluid
                            :inputProps="{ autocomplete: 'current-password' }"
                        />
                    </div>
                    <div class="flex flex-col gap-1.5">
                        <label for="new-password" class="text-meta text-muted font-medium">New password</label>
                        <Password
                            inputId="new-password"
                            v-model="newPassword"
                            toggleMask
                            :feedback="false"
                            fluid
                            :inputProps="{ autocomplete: 'new-password' }"
                        />
                    </div>
                    <div class="flex flex-col gap-1.5">
                        <label for="confirm-password" class="text-meta text-muted font-medium"
                            >Repeat new password</label
                        >
                        <Password
                            inputId="confirm-password"
                            v-model="confirmPassword"
                            toggleMask
                            :feedback="false"
                            fluid
                            :inputProps="{ autocomplete: 'new-password' }"
                        />
                    </div>
                    <small v-if="passwordSubmitted && passwordError" class="text-meta text-rose-300">
                        {{ passwordError }}
                    </small>
                    <Button type="submit" label="Update password" :loading="passwordLoading" class="mt-1" />
                </form>

                <router-link
                    v-if="isAdmin"
                    :to="{ name: 'admin' }"
                    class="hover:bg-surface-950 text-fg flex items-center gap-3.5 px-4 py-3.5 no-underline transition-colors"
                >
                    <span class="bg-surface-900 text-muted flex size-9 shrink-0 items-center justify-center rounded-xl">
                        <i class="pi pi-shield text-sm"></i>
                    </span>
                    <span class="text-body flex-1 font-medium">Manage users</span>
                    <i class="pi pi-chevron-right text-subtle text-xs"></i>
                </router-link>

                <button
                    type="button"
                    class="hover:bg-surface-950 flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors"
                    @click="handleClearCache"
                >
                    <span class="bg-surface-900 text-muted flex size-9 shrink-0 items-center justify-center rounded-xl">
                        <i class="pi pi-database text-sm"></i>
                    </span>
                    <span class="min-w-0 flex-1">
                        <span class="text-body text-fg block font-medium">Clear cached data</span>
                        <span class="text-meta text-muted block">Weather and map locations on this device</span>
                    </span>
                </button>
            </div>
        </section>

        <Button
            label="Sign out"
            icon="pi pi-sign-out"
            severity="danger"
            outlined
            class="w-full"
            @click="handleLogout"
        />
    </div>
</template>
