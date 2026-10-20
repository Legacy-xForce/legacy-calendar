<script setup lang="ts">
import { ref } from 'vue';
import InputText from 'primevue/inputtext';
import PasswordInput from '../components/PasswordInput.vue';
import Button from 'primevue/button';
import { useToast } from 'primevue/usetoast';
import { router } from '../router/router';
import { useSessionStore } from '../stores/session';
import AppLogo from '../components/AppLogo.vue';
import { requestNotificationPermission } from '../services/firebase';
import { isPasskeySupported } from '../services/webauthn';

const passkeySupported = isPasskeySupported();

const toast = useToast();
const sessionStore = useSessionStore();

const username = ref('');
const password = ref('');
const errorMessage = ref<string | null>(null);

const handleLogin = async () => {
    errorMessage.value = null;
    if (!username.value || !password.value) {
        errorMessage.value = 'Enter your username and password.';
        return;
    }

    const success = await sessionStore.login({
        username: username.value,
        password: password.value
    });

    if (success) {
        toast.add({
            severity: 'success',
            summary: `Welcome back, ${sessionStore.currentUser?.username}`,
            life: 2000
        });

        router.push('/calendar');

        await requestNotificationPermission();
    } else if (sessionStore.error) {
        // No error means login redirected (disabled account or missing access), so there is nothing to show
        errorMessage.value = sessionStore.error;
    }
};

const handlePasskeyLogin = async () => {
    errorMessage.value = null;
    const success = await sessionStore.loginWithPasskey(username.value || undefined);
    if (success) {
        router.push('/calendar');
        await requestNotificationPermission();
    } else if (sessionStore.error) {
        errorMessage.value = sessionStore.error;
    }
};
</script>

<template>
    <div
        class="flex min-h-dvh w-full items-center justify-center px-5 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
    >
        <div class="animate-rise-in flex w-full max-w-sm flex-col gap-8">
            <div class="flex flex-col items-center gap-4 text-center">
                <AppLogo class="text-fg size-12" />
                <div>
                    <h1 class="text-display m-0">Legacy</h1>
                    <p class="text-body text-muted m-0 mt-1">Sign in to see what the group is planning.</p>
                </div>
            </div>

            <form class="flex flex-col gap-4" novalidate @submit.prevent="handleLogin">
                <div class="flex flex-col gap-1.5">
                    <label for="username" class="text-meta text-muted font-medium">Username</label>
                    <InputText
                        id="username"
                        v-model="username"
                        autocomplete="username"
                        autocapitalize="none"
                        spellcheck="false"
                        :disabled="sessionStore.loading"
                        :invalid="!!errorMessage && !username"
                        fluid
                    />
                </div>

                <div class="flex flex-col gap-1.5">
                    <label for="password" class="text-meta text-muted font-medium">Password</label>
                    <PasswordInput
                        inputId="password"
                        v-model="password"
                        :disabled="sessionStore.loading"
                        :invalid="!!errorMessage && !password"
                        autocomplete="current-password"
                    />
                </div>

                <p
                    v-if="errorMessage"
                    class="text-meta animate-rise-in m-0 rounded-xl bg-rose-400/10 px-3 py-2 text-rose-200"
                    role="alert"
                >
                    {{ errorMessage }}
                </p>

                <Button
                    type="submit"
                    :label="sessionStore.loading ? 'Signing in…' : 'Sign in'"
                    class="mt-2 w-full"
                    :loading="sessionStore.loading"
                    :disabled="sessionStore.loading"
                />

                <template v-if="passkeySupported">
                    <div class="text-meta text-subtle flex items-center gap-3" aria-hidden="true">
                        <span class="bg-line h-px flex-1"></span>
                        or
                        <span class="bg-line h-px flex-1"></span>
                    </div>
                    <Button
                        type="button"
                        label="Sign in with a passkey"
                        icon="pi pi-key"
                        severity="secondary"
                        class="w-full"
                        :disabled="sessionStore.loading"
                        @click="handlePasskeyLogin"
                    />
                </template>
            </form>

            <p class="text-meta text-subtle m-0 text-center">
                Powered by <span class="text-muted font-semibold">xForce</span>
            </p>
        </div>
    </div>
</template>
