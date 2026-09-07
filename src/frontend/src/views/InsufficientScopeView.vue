<script setup lang="ts">
import Button from 'primevue/button';
import { useRouter } from 'vue-router';
import { useSessionStore } from '../stores/session';

const router = useRouter();
const sessionStore = useSessionStore();

const handleLogout = async () => {
    await sessionStore.logout();
    router.push('/');
};

const handleRetry = () => {
    router.push('/calendar');
};
</script>

<template>
    <div class="relative flex min-h-dvh w-full items-center justify-center overflow-hidden bg-[#09090b] p-4 sm:p-6">
        <!-- Subtle Glow -->
        <div
            class="pointer-events-none absolute top-1/2 left-1/2 size-125 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-500/10 blur-[120px]"
        ></div>

        <div
            class="relative z-10 w-full max-w-md rounded-3xl border border-amber-500/20 bg-zinc-900/70 p-6 text-center shadow-2xl backdrop-blur-xl sm:p-8"
        >
            <div
                class="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-400 shadow-inner"
            >
                <i class="pi pi-shield text-3xl font-bold"></i>
            </div>

            <div
                class="mb-2 inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold tracking-wider text-amber-400 uppercase"
            >
                <span class="size-2 animate-pulse rounded-full bg-amber-500"></span>
                Insufficient Permissions
            </div>

            <h1 class="mt-3 text-2xl font-black tracking-tight text-white sm:text-3xl">Scope Required</h1>

            <p class="mt-3 text-sm leading-relaxed text-zinc-400">
                Your authenticated account
                <span v-if="sessionStore.currentUser?.username" class="font-semibold text-white">
                    ({{ sessionStore.currentUser.username }})
                </span>
                does not currently have the required permission scope
                <code class="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-amber-300">calendar</code>
                to access Legacy Calendar.
            </p>

            <div class="my-6 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4 text-left text-xs text-zinc-400">
                <div class="flex items-start gap-2.5">
                    <i class="pi pi-key mt-0.5 text-amber-400"></i>
                    <div>
                        <span class="font-semibold text-zinc-300">Scopes managed via Legacy Auth</span>
                        <p class="mt-1 text-zinc-500">
                            Permissions and scopes are managed centrally. Please ask your administrator to grant the calendar scope to your profile.
                        </p>
                    </div>
                </div>
            </div>

            <div class="flex flex-col gap-3">
                <Button
                    label="Retry Connection"
                    icon="pi pi-refresh"
                    severity="warn"
                    class="w-full rounded-xl py-3 font-semibold transition"
                    @click="handleRetry"
                />
                <Button
                    label="Switch Account"
                    icon="pi pi-sign-out"
                    severity="secondary"
                    outlined
                    class="w-full rounded-xl py-3 font-semibold transition"
                    @click="handleLogout"
                />
            </div>
        </div>
    </div>
</template>
