<script setup lang="ts">
import { computed } from 'vue';
import UserAvatar from './UserAvatar.vue';
import { parseJwtPayload, useSessionStore } from '../stores/session';

defineProps<{
    icon: string;
    tone: 'rose' | 'amber';
    title: string;
}>();

const sessionStore = useSessionStore();

// A disabled account never loads its profile, so fall back to the name inside the stored token
const username = computed<string | undefined>(
    () => sessionStore.currentUser?.username ?? parseJwtPayload(localStorage.getItem('token') ?? '')?.username
);
const profilePictureUrl = computed(() => sessionStore.currentUser?.profilePictureUrl);

const toneClass = {
    rose: 'bg-rose-400/10 text-rose-300',
    amber: 'bg-amber-300/10 text-amber-200'
};
</script>

<template>
    <div
        class="flex min-h-dvh w-full items-center justify-center px-5 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
    >
        <div class="animate-rise-in flex w-full max-w-sm flex-col gap-8">
            <div class="flex flex-col items-center gap-4 text-center">
                <span class="flex size-14 items-center justify-center rounded-2xl" :class="toneClass[tone]">
                    <i :class="icon" class="text-xl"></i>
                </span>
                <div class="flex flex-col gap-2">
                    <h1 class="text-display m-0">{{ title }}</h1>
                    <p class="text-body text-muted m-0">
                        <slot />
                    </p>
                </div>
            </div>

            <div v-if="username" class="border-line bg-raised flex items-center gap-3 rounded-2xl border px-4 py-3">
                <UserAvatar :username="username" :profilePictureUrl="profilePictureUrl" />
                <div class="min-w-0">
                    <p class="text-meta text-muted m-0">Signed in as</p>
                    <p class="text-title text-fg m-0 truncate font-semibold">{{ username }}</p>
                </div>
            </div>

            <div class="flex flex-col gap-2">
                <slot name="actions" />
            </div>
        </div>
    </div>
</template>
