<script setup lang="ts">
import { ref } from 'vue';
import InputText from 'primevue/inputtext';
import Password from 'primevue/password';
import Button from 'primevue/button';
import { useToast } from 'primevue/usetoast';
import { router } from '../router/router';
import { useSessionStore } from '../stores/session';

import { requestNotificationPermission } from '../services/firebase';
import { isPasskeySupported } from '../services/webauthn';

const passkeySupported = isPasskeySupported();

const toast = useToast();
const sessionStore = useSessionStore();

const username = ref('');
const password = ref('');

const handleLogin = async () => {
    if (!username.value || !password.value) {
        toast.add({
            severity: 'warn',
            summary: 'Validation Error',
            detail: 'Please enter both username and password',
            life: 3000
        });
        return;
    }

    const success = await sessionStore.login({
        username: username.value,
        password: password.value
    });

    if (success) {
        toast.add({
            severity: 'success',
            summary: 'Welcome!',
            detail: `Logged in as ${sessionStore.currentUser?.username}`,
            life: 2000
        });

        router.push('/calendar');

        await requestNotificationPermission();
    } else if (sessionStore.error) {
        toast.add({
            severity: 'error',
            summary: 'Login Failed',
            detail: sessionStore.error || 'Please check your credentials',
            life: 4000
        });
    }
};

const handlePasskeyLogin = async () => {
    const success = await sessionStore.loginWithPasskey(username.value || undefined);
    if (success) {
        router.push('/calendar');
        await requestNotificationPermission();
    } else {
        toast.add({
            severity: 'error',
            summary: 'Passkey sign-in failed',
            detail: sessionStore.error || 'The passkey could not be verified.',
            life: 4000
        });
    }
};
</script>

<template>
    <div class="relative flex min-h-dvh w-full items-center justify-center overflow-hidden bg-[#09090b] p-4 sm:p-6">
        <!-- Subtle Glow -->
        <div
            class="pointer-events-none absolute top-1/2 left-1/2 size-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/10 blur-[100px]"
        ></div>

        <div
            class="relative z-10 w-full max-w-104 rounded-2xl border border-zinc-800 bg-zinc-900/60 shadow-2xl backdrop-blur-xl transition-all duration-300"
        >
            <div class="p-6 sm:p-8">
                <div class="mb-8 flex flex-col items-center text-center">
                    <div
                        class="mb-5 flex h-14 w-14 items-center justify-center rounded-xl border border-zinc-700/50 bg-zinc-800/60 shadow-sm"
                    >
                        <i style="font-size: 1.5rem" class="pi pi-calendar text-emerald-400"></i>
                    </div>
                    <h1 class="mb-2 text-2xl font-bold tracking-tight text-white">Legacy Calendar</h1>
                    <p class="text-sm text-zinc-400">Sign in to your account</p>
                </div>

                <form @submit.prevent="handleLogin" class="space-y-6">
                    <div class="space-y-2">
                        <label for="username" class="ml-1 text-sm font-medium text-zinc-300">Username</label>
                        <InputText
                            id="username"
                            v-model="username"
                            class="w-full rounded-xl border-zinc-800 bg-zinc-950/50 p-3 focus:border-emerald-500"
                            placeholder="Enter your username"
                            :disabled="sessionStore.loading"
                            fluid
                        />
                    </div>

                    <div class="space-y-2">
                        <label for="password" class="ml-1 text-sm font-medium text-zinc-300">Password</label>
                        <Password
                            id="password"
                            v-model="password"
                            :feedback="false"
                            toggleMask
                            class="w-full"
                            inputClass="w-full bg-zinc-950/50 border-zinc-800 focus:border-emerald-500 rounded-xl p-3"
                            placeholder="Enter your password"
                            :disabled="sessionStore.loading"
                            fluid
                        />
                    </div>

                    <Button
                        type="submit"
                        :label="sessionStore.loading ? 'Signing in...' : 'Sign In'"
                        class="mt-8! w-full rounded-xl py-3 font-semibold shadow-[0_0_15px_rgba(52,211,153,0.15)] transition-all duration-300 hover:shadow-[0_0_25px_rgba(52,211,153,0.3)]"
                        :loading="sessionStore.loading"
                        :disabled="sessionStore.loading"
                    />

                    <Button
                        v-if="passkeySupported"
                        type="button"
                        label="Sign in with Passkey"
                        icon="pi pi-key"
                        severity="secondary"
                        outlined
                        :loading="sessionStore.loading"
                        :disabled="sessionStore.loading"
                        class="w-full rounded-xl py-3 font-semibold"
                        @click="handlePasskeyLogin"
                    />
                </form>

                <div class="mt-8 flex items-center justify-center border-t border-zinc-800/50 pt-6">
                    <p class="text-xs text-zinc-500">Powered by <span class="font-bold text-zinc-400">xForce</span></p>
                </div>
            </div>
        </div>
    </div>
</template>
