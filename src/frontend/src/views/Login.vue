<script setup lang="ts">
import { ref } from 'vue';
import { useRoute } from 'vue-router';
import Button from 'primevue/button';
import { useSessionStore } from '../stores/session';
import AppLogo from '../components/AppLogo.vue';
import { AuthError } from '../services/oidc';

const route = useRoute();
const sessionStore = useSessionStore();

const starting = ref(false);
const errorMessage = ref<string | null>(null);

// Only paths inside the app: the value comes from the address bar.
function returnTo(): string {
    const next = route.query.next;
    return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : '/calendar';
}

const handleSignIn = async () => {
    errorMessage.value = null;
    starting.value = true;
    try {
        // Leaves the page for Legacy Auth, which owns the password and passkey form.
        await sessionStore.signIn(returnTo());
    } catch (error) {
        starting.value = false;
        errorMessage.value = error instanceof AuthError ? error.message : 'Sign-in failed. Please try again.';
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

            <div class="flex flex-col gap-4">
                <p
                    v-if="errorMessage || sessionStore.error"
                    class="text-meta animate-rise-in m-0 rounded-xl bg-rose-400/10 px-3 py-2 text-rose-200"
                    role="alert"
                >
                    {{ errorMessage || sessionStore.error }}
                </p>

                <Button
                    type="button"
                    :label="starting ? 'Opening Legacy Auth…' : 'Sign in with Legacy'"
                    class="w-full"
                    :loading="starting"
                    :disabled="starting"
                    @click="handleSignIn"
                />
            </div>

            <p class="text-meta text-subtle m-0 text-center">
                Powered by <span class="text-muted font-semibold">xForce</span>
            </p>
        </div>
    </div>
</template>
