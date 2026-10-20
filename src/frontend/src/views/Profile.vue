<script setup lang="ts">
import { ref, computed, toRaw, onMounted, watch } from 'vue';
import { clear } from 'idb-keyval';
import { useSessionStore } from '../stores/session';
import Button from 'primevue/button';
import PasswordInput from '../components/PasswordInput.vue';
import InputText from 'primevue/inputtext';
import ToggleSwitch from 'primevue/toggleswitch';
import SelectButton from 'primevue/selectbutton';
import { storeToRefs } from 'pinia';
import { usePreferencesStore, type MobileCalendarLayout } from '../stores/preferences';
import { THEMES } from '../theme/themes';
import UserAvatar from '../components/UserAvatar.vue';
import UserMultiSelect from '../components/UserMultiSelect.vue';
import BankLogo from '../components/BankLogo.vue';
import { useToast } from 'primevue/usetoast';
import { useConfirm } from 'primevue/useconfirm';
import { notificationStorage } from '../services/notificationStorage';
import { NotificationCode, type NotificationSettings } from '../types/Notification';
import { router } from '../router/router';
import { createLogger } from '../services/logger';
import api from '../services/API';
import { isPasskeySupported } from '../services/webauthn';
import { useUsersStore } from '../stores/users';
import { useUserGroupsStore } from '../stores/userGroups';
import type { UserGroup } from '../types/UserGroup';
import type { ApiToken, ApiTokenScope } from '../types/ApiToken';
import { formatIban, getItalianBankName, isValidIban, normalizeIban } from '../utils/iban';

const sessionStore = useSessionStore();
const toast = useToast();
const confirm = useConfirm();
const logger = createLogger('ProfileView');

const preferencesStore = usePreferencesStore();
const { mobileCalendarLayout, theme } = storeToRefs(preferencesStore);
const { setTheme } = preferencesStore;
const themes = THEMES;

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

const usersStore = useUsersStore();
const userGroupsStore = useUserGroupsStore();
const { users } = storeToRefs(usersStore);
const { groups: userGroups, loading: groupsLoading } = storeToRefs(userGroupsStore);

// ---------- Payment details: shown on events you host so people know where to send their share ----------

const showPaymentForm = ref(false);
const paypalLink = ref('');
const revolutLink = ref('');
const ibanNumber = ref('');
const ibanAccountHolder = ref('');
const paymentSaving = ref(false);
const ibanTouched = ref(false);

const ibanInvalid = computed(() => ibanNumber.value.trim().length > 0 && !isValidIban(ibanNumber.value));
const ibanBankName = computed(() => getItalianBankName(ibanNumber.value));
const paymentFormValid = computed(() => !ibanInvalid.value);

watch(
    currentUser,
    (user) => {
        if (!user) return;
        paypalLink.value = user.paypalLink ?? '';
        revolutLink.value = user.revolutLink ?? '';
        ibanNumber.value = user.ibanNumber ?? '';
        ibanAccountHolder.value = user.ibanAccountHolder ?? '';
    },
    { immediate: true }
);

const paymentSummary = computed(() => {
    const user = currentUser.value;
    const methods = [user?.paypalLink && 'PayPal', user?.revolutLink && 'Revolut', user?.ibanNumber && 'IBAN'].filter(
        Boolean
    );
    return methods.length ? methods.join(' · ') : 'Not set';
});

/** Only the bare domain/path is stored; links are made absolute when shown. */
const normalizeLink = (value: string) => value.trim().replace(/^https?:\/\//i, '');

const handleIbanBlur = () => {
    ibanTouched.value = true;
    if (ibanNumber.value.trim() && isValidIban(ibanNumber.value)) {
        ibanNumber.value = formatIban(ibanNumber.value);
    }
};

const handlePaymentInfoSave = async () => {
    ibanTouched.value = true;
    if (ibanInvalid.value) return;

    paymentSaving.value = true;
    try {
        const response = await api.updateMyPaymentInfo({
            paypalLink: normalizeLink(paypalLink.value),
            ibanNumber: normalizeIban(ibanNumber.value),
            ibanAccountHolder: ibanAccountHolder.value.trim(),
            revolutLink: normalizeLink(revolutLink.value)
        });
        await sessionStore.updateProfile(response.data);
        toast.add({ severity: 'success', summary: 'Payment details saved', life: 2500 });
        showPaymentForm.value = false;
    } catch (error: any) {
        toast.add({
            severity: 'error',
            summary: "Couldn't save payment details",
            detail: error.response?.data?.message || 'Check the fields and try again.',
            life: 4000
        });
    } finally {
        paymentSaving.value = false;
    }
};

// ---------- Invitation groups: saved invite lists you can apply to any event ----------

const groupEditor = ref<{ id: number | null; name: string; memberIds: number[] } | null>(null);
const groupSaving = ref(false);
const groupMemberOptions = computed(() => users.value.filter((user) => user.id !== currentUser.value?.id));

const startGroupEditor = (group?: UserGroup) => {
    groupEditor.value = { id: group?.id ?? null, name: group?.name ?? '', memberIds: [...(group?.memberIds ?? [])] };
};

const saveGroup = async () => {
    const editor = groupEditor.value;
    const name = editor?.name.trim();
    if (!editor || !name) return;

    groupSaving.value = true;
    try {
        if (editor.id === null) {
            await userGroupsStore.createGroup({ name, memberIds: editor.memberIds });
        } else {
            await userGroupsStore.updateGroup(editor.id, { name, memberIds: editor.memberIds });
        }
        toast.add({
            severity: 'success',
            summary: editor.id === null ? `"${name}" created` : `"${name}" saved`,
            life: 2500
        });
        groupEditor.value = null;
    } catch {
        toast.add({ severity: 'error', summary: "Couldn't save the group", detail: 'Please try again.', life: 3500 });
    } finally {
        groupSaving.value = false;
    }
};

const deleteGroup = (group: UserGroup) => {
    confirm.require({
        message: 'The people in it stay invited to events they were already added to.',
        header: `Delete "${group.name}"?`,
        rejectProps: { label: 'Cancel', severity: 'secondary', text: true },
        acceptProps: { label: 'Delete', severity: 'danger' },
        accept: async () => {
            try {
                await userGroupsStore.deleteGroup(group.id);
                if (groupEditor.value?.id === group.id) groupEditor.value = null;
                toast.add({ severity: 'success', summary: `"${group.name}" deleted`, life: 2500 });
            } catch {
                toast.add({ severity: 'error', summary: "Couldn't delete the group", life: 3500 });
            }
        }
    });
};

// ---------- API tokens: long-lived credentials for scripts and integrations ----------

const API_TOKEN_LIMIT = 25;

const apiTokens = ref<ApiToken[]>([]);
const apiTokensLoading = ref(false);
const tokenEditor = ref<{ name: string; scope: ApiTokenScope } | null>(null);
const tokenSaving = ref(false);
const newApiToken = ref<{ id: number; token: string; label: string } | null>(null);
const tokenCopied = ref(false);

const tokenScopeOptions: { value: ApiTokenScope; label: string; icon: string; hint: string }[] = [
    { value: 'read', label: 'Read only', icon: 'pi pi-eye', hint: 'Only GET requests, never changes anything.' },
    { value: 'write', label: 'Read & write', icon: 'pi pi-pencil', hint: 'Everything your account can do.' }
];

const tokenScopeHint = computed(
    () => tokenScopeOptions.find((option) => option.value === tokenEditor.value?.scope)?.hint
);
const tokenLimitReached = computed(() => apiTokens.value.length >= API_TOKEN_LIMIT);
const tokenScopeLabel = (scope: ApiTokenScope) => (scope === 'write' ? 'Read & write' : 'Read only');

const loadApiTokens = async () => {
    apiTokensLoading.value = true;
    try {
        apiTokens.value = (await api.getApiTokens()).data;
    } catch (error) {
        logger.warn('Failed to load API tokens', error);
        toast.add({ severity: 'error', summary: "Couldn't load API tokens", life: 3500 });
    } finally {
        apiTokensLoading.value = false;
    }
};

const startTokenEditor = () => {
    newApiToken.value = null;
    tokenCopied.value = false;
    tokenEditor.value = { name: '', scope: 'read' };
};

const handleCreateToken = async () => {
    const editor = tokenEditor.value;
    if (!editor) return;

    tokenSaving.value = true;
    try {
        const { token, ...metadata } = (
            await api.createApiToken({
                name: editor.name.trim() || undefined,
                scope: editor.scope
            })
        ).data;
        apiTokens.value = [metadata, ...apiTokens.value];
        newApiToken.value = { id: metadata.id, token, label: metadata.name };
        tokenEditor.value = null;
        tokenCopied.value = false;
        toast.add({ severity: 'success', summary: `"${metadata.name}" created`, life: 2500 });
    } catch (error: any) {
        toast.add({
            severity: 'error',
            summary: "Couldn't create the token",
            detail: error.response?.data?.message || 'Please try again.',
            life: 4000
        });
    } finally {
        tokenSaving.value = false;
    }
};

const copyApiToken = async () => {
    if (!newApiToken.value) return;
    try {
        await navigator.clipboard.writeText(newApiToken.value.token);
        tokenCopied.value = true;
        window.setTimeout(() => (tokenCopied.value = false), 2000);
    } catch {
        toast.add({
            severity: 'error',
            summary: "Couldn't copy automatically",
            detail: 'Select the token and copy it manually.',
            life: 4000
        });
    }
};

const dismissNewToken = () => {
    newApiToken.value = null;
    tokenCopied.value = false;
};

const rotateApiToken = (token: ApiToken) => {
    confirm.require({
        header: `Rotate "${token.name}"?`,
        message: 'The current value stops working immediately. Any integration using it will need the new token.',
        rejectProps: { label: 'Cancel', severity: 'secondary', text: true },
        acceptProps: { label: 'Rotate', severity: 'danger' },
        accept: async () => {
            try {
                const { token: plainToken, ...metadata } = (await api.rotateApiToken(token.id)).data;
                apiTokens.value = apiTokens.value.map((item) => (item.id === token.id ? metadata : item));
                newApiToken.value = { id: metadata.id, token: plainToken, label: metadata.name };
                tokenCopied.value = false;
                toast.add({ severity: 'success', summary: `"${metadata.name}" rotated`, life: 2500 });
            } catch (error: any) {
                toast.add({
                    severity: 'error',
                    summary: "Couldn't rotate the token",
                    detail: error.response?.data?.message || 'Please try again.',
                    life: 4000
                });
            }
        }
    });
};

const deleteApiToken = (token: ApiToken) => {
    confirm.require({
        header: `Delete "${token.name}"?`,
        message: 'Any integration using this token will stop working immediately. This cannot be undone.',
        rejectProps: { label: 'Cancel', severity: 'secondary', text: true },
        acceptProps: { label: 'Delete', severity: 'danger' },
        accept: async () => {
            try {
                await api.deleteApiToken(token.id);
                apiTokens.value = apiTokens.value.filter((item) => item.id !== token.id);
                if (newApiToken.value?.id === token.id) dismissNewToken();
                toast.add({ severity: 'success', summary: `"${token.name}" deleted`, life: 2500 });
            } catch (error: any) {
                toast.add({
                    severity: 'error',
                    summary: "Couldn't delete the token",
                    detail: error.response?.data?.message || 'Please try again.',
                    life: 4000
                });
            }
        }
    });
};

// ---------- Passkeys ----------

const passkeySupported = isPasskeySupported();
const passkeys = ref<{ id: string; deviceName: string; createdAt: string }[]>([]);
const showPasskeys = ref(false);
const passkeyLoading = ref(false);
const newPasskeyName = ref<string | null>(null);

const guessDeviceName = () => {
    const agent = navigator.userAgent;
    if (/iPhone/i.test(agent)) return 'iPhone';
    if (/iPad/i.test(agent)) return 'iPad';
    if (/Android/i.test(agent)) return 'Android phone';
    if (/Mac/i.test(agent)) return 'Mac';
    if (/Windows/i.test(agent)) return 'Windows PC';
    return 'This device';
};

const handleRegisterPasskey = async () => {
    passkeyLoading.value = true;
    try {
        await sessionStore.registerPasskey(newPasskeyName.value?.trim() || undefined);
        passkeys.value = (await api.getPasskeys()).data;
        newPasskeyName.value = null;
        toast.add({
            severity: 'success',
            summary: 'Passkey added',
            detail: 'This device can now sign you in.',
            life: 3000
        });
    } catch (error: any) {
        toast.add({ severity: 'error', summary: "Couldn't add the passkey", detail: error.message, life: 4000 });
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
        toast.add({ severity: 'error', summary: "Couldn't remove the passkey", detail: error.message, life: 3500 });
    }
};

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
    await Promise.all([
        usersStore.fetchUsers(),
        userGroupsStore.fetchGroups(),
        loadApiTokens(),
        !currentUser.value ? sessionStore.load() : Promise.resolve()
    ]);
    if (passkeySupported) {
        try {
            passkeys.value = (await api.getPasskeys()).data;
        } catch (error) {
            logger.warn('Failed to load passkeys', error);
        }
    }
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
                <h2 class="eyebrow m-0">Appearance</h2>
                <p class="text-meta text-subtle m-0 mt-1">OLED or Catppuccin. Saved on this device only.</p>
            </div>
            <div class="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Theme">
                <button
                    v-for="option in themes"
                    :key="option.id"
                    type="button"
                    role="radio"
                    :aria-checked="theme === option.id"
                    :aria-label="`${option.label}, ${option.mode}`"
                    class="pressable flex items-center gap-2 rounded-full border py-1 pr-2.5 pl-1.5 transition-colors"
                    :class="
                        theme === option.id
                            ? 'border-accent bg-accent-soft text-fg'
                            : 'border-line bg-raised text-muted hover:bg-surface-950 hover:text-fg'
                    "
                    @click="setTheme(option.id)"
                >
                    <span
                        class="border-line flex size-6 shrink-0 items-center justify-center rounded-full border"
                        :style="{ backgroundColor: option.preview.canvas }"
                    >
                        <span
                            class="flex h-3.5 w-3.5 flex-col justify-center gap-px rounded-[4px] p-0.5"
                            :style="{ backgroundColor: option.preview.raised }"
                        >
                            <span
                                class="h-px w-2 rounded-full"
                                :style="{ backgroundColor: option.preview.text }"
                            ></span>
                            <span
                                class="h-px w-1.5 rounded-full"
                                :style="{ backgroundColor: option.preview.accent }"
                            ></span>
                        </span>
                    </span>
                    <span class="text-meta font-medium">{{ option.shortLabel }}</span>
                    <i v-if="theme === option.id" class="pi pi-check text-accent text-[0.625rem]"></i>
                </button>
            </div>
        </section>

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

        <section class="flex flex-col gap-2">
            <div>
                <h2 class="eyebrow m-0">Payments</h2>
                <p class="text-meta text-subtle m-0 mt-1">
                    Shown on events you host that have costs, so people know where to send their share.
                </p>
            </div>
            <div class="border-line bg-raised divide-line divide-y overflow-hidden rounded-2xl border">
                <button
                    type="button"
                    class="hover:bg-surface-950 flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors"
                    :aria-expanded="showPaymentForm"
                    @click="showPaymentForm = !showPaymentForm"
                >
                    <span class="bg-surface-900 text-muted flex size-9 shrink-0 items-center justify-center rounded-xl">
                        <i class="pi pi-wallet text-sm"></i>
                    </span>
                    <span class="min-w-0 flex-1">
                        <span class="text-body text-fg block font-medium">Payment details</span>
                        <span class="text-meta text-muted block">{{ paymentSummary }}</span>
                    </span>
                    <i
                        class="pi pi-chevron-down text-subtle text-xs transition-transform duration-200"
                        :class="{ 'rotate-180': showPaymentForm }"
                    ></i>
                </button>
                <form
                    v-if="showPaymentForm"
                    class="animate-rise-in flex flex-col gap-3 px-4 pt-2 pb-4"
                    novalidate
                    @submit.prevent="handlePaymentInfoSave"
                >
                    <div class="flex flex-col gap-1.5">
                        <label for="paypal-link" class="text-meta text-muted font-medium">PayPal link</label>
                        <InputText
                            id="paypal-link"
                            v-model="paypalLink"
                            placeholder="paypal.me/yourname"
                            inputmode="url"
                            autocapitalize="none"
                            fluid
                        />
                    </div>
                    <div class="flex flex-col gap-1.5">
                        <label for="revolut-link" class="text-meta text-muted font-medium">Revolut link</label>
                        <InputText
                            id="revolut-link"
                            v-model="revolutLink"
                            placeholder="revolut.me/yourname"
                            inputmode="url"
                            autocapitalize="none"
                            fluid
                        />
                    </div>
                    <div class="flex flex-col gap-1.5">
                        <label for="iban-number" class="text-meta text-muted font-medium">IBAN</label>
                        <InputText
                            id="iban-number"
                            v-model="ibanNumber"
                            placeholder="IT60 X054 2811 1010 0000 0123 456"
                            autocapitalize="characters"
                            spellcheck="false"
                            class="font-mono"
                            :invalid="ibanTouched && ibanInvalid"
                            fluid
                            @blur="handleIbanBlur"
                        />
                        <p v-if="ibanTouched && ibanInvalid" class="text-meta m-0 text-rose-300">
                            That doesn't look like a valid IBAN.
                        </p>
                        <p v-else-if="ibanBankName" class="text-meta m-0 flex items-center gap-1.5 text-emerald-300/90">
                            <BankLogo :iban="ibanNumber" :name="ibanBankName" class="size-4 rounded text-[0.5rem]" />
                            <span>{{ ibanBankName }}</span>
                        </p>
                    </div>
                    <div class="flex flex-col gap-1.5">
                        <label for="iban-account-holder" class="text-meta text-muted font-medium">Account holder</label>
                        <InputText id="iban-account-holder" v-model="ibanAccountHolder" autocomplete="name" fluid />
                    </div>
                    <p class="text-meta text-subtle m-0">Leave a field empty to hide it.</p>
                    <Button
                        type="submit"
                        label="Save payment details"
                        :loading="paymentSaving"
                        :disabled="!paymentFormValid"
                        class="mt-1"
                    />
                </form>
            </div>
        </section>

        <section class="flex flex-col gap-2">
            <div class="flex items-end justify-between gap-3">
                <div>
                    <h2 class="eyebrow m-0">Invitation groups</h2>
                    <p class="text-meta text-subtle m-0 mt-1">Saved invite lists you can add to an event in one tap.</p>
                </div>
                <Button
                    v-if="!groupEditor"
                    label="New"
                    icon="pi pi-plus"
                    size="small"
                    severity="secondary"
                    @click="startGroupEditor()"
                />
            </div>

            <div
                v-if="groupEditor"
                class="border-line bg-raised animate-rise-in flex flex-col gap-3 rounded-2xl border p-4"
            >
                <div class="flex flex-col gap-1.5">
                    <label for="group-name" class="text-meta text-muted font-medium">Name</label>
                    <InputText
                        id="group-name"
                        v-model="groupEditor.name"
                        placeholder="e.g. Weekend crew"
                        autofocus
                        fluid
                    />
                </div>
                <div class="flex flex-col gap-1.5">
                    <label for="group-members" class="text-meta text-muted font-medium">
                        People
                        <span v-if="groupEditor.memberIds.length" class="tabular"
                            >· {{ groupEditor.memberIds.length }}</span
                        >
                    </label>
                    <UserMultiSelect
                        inputId="group-members"
                        v-model="groupEditor.memberIds"
                        :options="groupMemberOptions"
                        placeholder="Choose friends"
                        filter
                    />
                </div>
                <div class="flex justify-end gap-2">
                    <Button label="Cancel" severity="secondary" text @click="groupEditor = null" />
                    <Button
                        :label="groupEditor.id === null ? 'Create group' : 'Save group'"
                        icon="pi pi-check"
                        :loading="groupSaving"
                        :disabled="!groupEditor.name.trim()"
                        @click="saveGroup"
                    />
                </div>
            </div>

            <p v-if="groupsLoading && !userGroups.length" class="text-meta text-muted m-0">Loading groups…</p>
            <div
                v-else-if="userGroups.length"
                class="border-line bg-raised divide-line divide-y overflow-hidden rounded-2xl border"
            >
                <div v-for="group in userGroups" :key="group.id" class="flex items-center gap-3 px-4 py-2.5">
                    <span class="bg-surface-900 text-muted flex size-9 shrink-0 items-center justify-center rounded-xl">
                        <i class="pi pi-users text-sm"></i>
                    </span>
                    <span class="min-w-0 flex-1">
                        <span class="text-body text-fg block truncate font-medium">{{ group.name }}</span>
                        <span class="text-meta text-muted tabular block">
                            {{ group.memberIds.length }} {{ group.memberIds.length === 1 ? 'person' : 'people' }}
                        </span>
                    </span>
                    <Button
                        icon="pi pi-pencil"
                        text
                        rounded
                        severity="secondary"
                        :aria-label="`Edit ${group.name}`"
                        @click="startGroupEditor(group)"
                    />
                    <Button
                        icon="pi pi-trash"
                        text
                        rounded
                        severity="danger"
                        :aria-label="`Delete ${group.name}`"
                        @click="deleteGroup(group)"
                    />
                </div>
            </div>
            <p
                v-else-if="!groupEditor"
                class="text-meta text-muted border-line m-0 rounded-2xl border border-dashed px-4 py-4 text-center"
            >
                No groups yet. Make one for the people you invite most.
            </p>
        </section>

        <section class="flex flex-col gap-2">
            <div class="flex items-end justify-between gap-3">
                <div>
                    <h2 class="eyebrow m-0">API tokens</h2>
                    <p class="text-meta text-subtle m-0 mt-1">
                        Long-lived credentials for scripts and integrations. They don't expire on their own.
                    </p>
                </div>
                <Button
                    v-if="!tokenEditor && !newApiToken"
                    label="New"
                    icon="pi pi-plus"
                    size="small"
                    severity="secondary"
                    :disabled="tokenLimitReached"
                    @click="startTokenEditor"
                />
            </div>

            <div
                v-if="newApiToken"
                class="border-accent/40 bg-accent-soft animate-rise-in flex flex-col gap-3 rounded-2xl border p-4"
            >
                <div class="flex items-start gap-3">
                    <span
                        class="bg-accent-soft text-accent flex size-9 shrink-0 items-center justify-center rounded-xl"
                    >
                        <i class="pi pi-key text-sm"></i>
                    </span>
                    <div class="min-w-0 flex-1">
                        <p class="text-body text-fg m-0 font-medium">"{{ newApiToken.label }}" is ready</p>
                        <p class="text-meta text-muted m-0">
                            Copy it now. For security, the full token won't be shown again.
                        </p>
                    </div>
                    <Button
                        icon="pi pi-times"
                        text
                        rounded
                        severity="secondary"
                        aria-label="Dismiss the new token"
                        @click="dismissNewToken"
                    />
                </div>
                <div class="bg-canvas/60 border-line flex items-center gap-2 rounded-xl border p-2.5">
                    <code class="text-meta text-fg min-w-0 flex-1 font-mono break-all">{{ newApiToken.token }}</code>
                    <Button
                        :icon="tokenCopied ? 'pi pi-check' : 'pi pi-copy'"
                        :severity="tokenCopied ? 'success' : 'secondary'"
                        text
                        rounded
                        :aria-label="tokenCopied ? 'Token copied' : 'Copy token'"
                        @click="copyApiToken"
                    />
                </div>
            </div>

            <div
                v-if="tokenEditor"
                class="border-line bg-raised animate-rise-in flex flex-col gap-3 rounded-2xl border p-4"
            >
                <div class="flex flex-col gap-1.5">
                    <label for="token-name" class="text-meta text-muted font-medium">Name</label>
                    <InputText
                        id="token-name"
                        v-model="tokenEditor.name"
                        placeholder="e.g. Home Assistant"
                        maxlength="60"
                        autofocus
                        fluid
                    />
                </div>
                <div class="flex flex-col gap-1.5">
                    <span class="text-meta text-muted font-medium">Scope</span>
                    <SelectButton
                        v-model="tokenEditor.scope"
                        :options="tokenScopeOptions"
                        optionLabel="label"
                        optionValue="value"
                        :allowEmpty="false"
                        fluid
                        aria-label="Token scope"
                    >
                        <template #option="slotProps">
                            <span class="flex items-center gap-2">
                                <i :class="slotProps.option.icon" class="text-xs"></i>
                                <span class="text-meta font-medium">{{ slotProps.option.label }}</span>
                            </span>
                        </template>
                    </SelectButton>
                    <p class="text-meta text-muted m-0">{{ tokenScopeHint }}</p>
                </div>
                <div class="flex justify-end gap-2">
                    <Button label="Cancel" severity="secondary" text @click="tokenEditor = null" />
                    <Button label="Create token" icon="pi pi-check" :loading="tokenSaving" @click="handleCreateToken" />
                </div>
            </div>

            <p v-if="apiTokensLoading && !apiTokens.length" class="text-meta text-muted m-0">Loading tokens…</p>
            <div
                v-else-if="apiTokens.length"
                class="border-line bg-raised divide-line divide-y overflow-hidden rounded-2xl border"
            >
                <div v-for="token in apiTokens" :key="token.id" class="flex items-center gap-3 px-4 py-3">
                    <span class="bg-surface-900 text-muted flex size-9 shrink-0 items-center justify-center rounded-xl">
                        <i :class="token.scope === 'write' ? 'pi pi-pencil' : 'pi pi-eye'" class="text-sm"></i>
                    </span>
                    <span class="min-w-0 flex-1">
                        <span class="text-body text-fg flex items-center gap-2 truncate font-medium">
                            {{ token.name }}
                            <span
                                class="rounded-full px-2 py-0.5 text-[0.6875rem] font-medium"
                                :class="
                                    token.scope === 'write' ? 'bg-accent-soft text-accent' : 'bg-surface-850 text-muted'
                                "
                            >
                                {{ tokenScopeLabel(token.scope) }}
                            </span>
                        </span>
                        <span class="text-meta text-subtle tabular block font-mono">{{ token.tokenHint }}</span>
                        <span class="text-meta text-subtle block">
                            Created {{ new Date(token.createdAt).toLocaleDateString() }} ·
                            {{
                                token.lastUsedAt
                                    ? `last used ${new Date(token.lastUsedAt).toLocaleDateString()}`
                                    : 'never used'
                            }}
                        </span>
                    </span>
                    <div class="flex shrink-0 items-center">
                        <Button
                            icon="pi pi-refresh"
                            text
                            rounded
                            severity="secondary"
                            :aria-label="`Rotate ${token.name}`"
                            v-tooltip.top="'Rotate token'"
                            @click="rotateApiToken(token)"
                        />
                        <Button
                            icon="pi pi-trash"
                            text
                            rounded
                            severity="danger"
                            :aria-label="`Delete ${token.name}`"
                            @click="deleteApiToken(token)"
                        />
                    </div>
                </div>
            </div>
            <p
                v-else-if="!tokenEditor"
                class="text-meta text-muted border-line m-0 rounded-2xl border border-dashed px-4 py-4 text-center"
            >
                No API tokens yet. Create one for a script, dashboard or home automation.
            </p>
            <p v-if="tokenLimitReached" class="text-meta text-muted m-0">
                You've reached the limit of {{ API_TOKEN_LIMIT }} tokens. Delete one to create another.
            </p>
            <router-link
                :to="{ name: 'docs' }"
                class="text-meta text-muted hover:text-fg border-line flex items-center gap-2 rounded-xl border border-dashed px-3.5 py-2.5 no-underline transition-colors"
            >
                <i class="pi pi-book text-xs"></i>
                <span class="flex-1">API documentation · every endpoint, header and scope</span>
                <i class="pi pi-chevron-right text-[0.625rem]"></i>
            </router-link>
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
                        <PasswordInput
                            inputId="current-password"
                            v-model="currentPassword"
                            autocomplete="current-password"
                        />
                    </div>
                    <div class="flex flex-col gap-1.5">
                        <label for="new-password" class="text-meta text-muted font-medium">New password</label>
                        <PasswordInput inputId="new-password" v-model="newPassword" autocomplete="new-password" />
                    </div>
                    <div class="flex flex-col gap-1.5">
                        <label for="confirm-password" class="text-meta text-muted font-medium"
                            >Repeat new password</label
                        >
                        <PasswordInput
                            inputId="confirm-password"
                            v-model="confirmPassword"
                            autocomplete="new-password"
                        />
                    </div>
                    <small v-if="passwordSubmitted && passwordError" class="text-meta text-rose-300">
                        {{ passwordError }}
                    </small>
                    <Button type="submit" label="Update password" :loading="passwordLoading" class="mt-1" />
                </form>

                <template v-if="passkeySupported">
                    <button
                        type="button"
                        class="hover:bg-surface-950 flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition-colors"
                        :aria-expanded="showPasskeys"
                        @click="showPasskeys = !showPasskeys"
                    >
                        <span
                            class="bg-surface-900 text-muted flex size-9 shrink-0 items-center justify-center rounded-xl"
                        >
                            <i class="pi pi-lock text-sm"></i>
                        </span>
                        <span class="min-w-0 flex-1">
                            <span class="text-body text-fg block font-medium">Passkeys</span>
                            <span class="text-meta text-muted block">
                                {{
                                    passkeys.length
                                        ? `${passkeys.length} ${passkeys.length === 1 ? 'device' : 'devices'}`
                                        : 'Sign in with Face ID, fingerprint or your device PIN'
                                }}
                            </span>
                        </span>
                        <i
                            class="pi pi-chevron-down text-subtle text-xs transition-transform duration-200"
                            :class="{ 'rotate-180': showPasskeys }"
                        ></i>
                    </button>
                    <div v-if="showPasskeys" class="animate-rise-in flex flex-col gap-2 px-4 pt-1 pb-4">
                        <div
                            v-for="passkey in passkeys"
                            :key="passkey.id"
                            class="bg-surface-900 flex items-center gap-3 rounded-xl py-1.5 pr-1.5 pl-3"
                        >
                            <span class="min-w-0 flex-1">
                                <span class="text-body text-fg block truncate">{{ passkey.deviceName }}</span>
                                <span class="text-meta text-subtle block">
                                    Added {{ new Date(passkey.createdAt).toLocaleDateString() }}
                                </span>
                            </span>
                            <Button
                                icon="pi pi-trash"
                                severity="danger"
                                text
                                rounded
                                :aria-label="`Remove ${passkey.deviceName}`"
                                @click="handleDeletePasskey(passkey.id)"
                            />
                        </div>
                        <div v-if="newPasskeyName !== null" class="flex items-center gap-2">
                            <InputText
                                v-model="newPasskeyName"
                                aria-label="Passkey name"
                                autofocus
                                fluid
                                @keydown.enter.prevent="handleRegisterPasskey"
                            />
                            <Button label="Add" :loading="passkeyLoading" @click="handleRegisterPasskey" />
                        </div>
                        <Button
                            v-else
                            label="Add this device"
                            icon="pi pi-plus"
                            severity="secondary"
                            class="self-start"
                            @click="newPasskeyName = guessDeviceName()"
                        />
                    </div>
                </template>

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
