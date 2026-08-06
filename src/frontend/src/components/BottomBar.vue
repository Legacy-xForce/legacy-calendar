<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { router } from '../router/router';
import { useSessionStore } from '../stores/session';
import UserAvatar from './UserAvatar.vue';

const route = useRoute();
const sessionStore = useSessionStore();
const currentUser = computed(() => sessionStore.currentUser);
const isAuthenticated = computed(() => sessionStore.isAuthenticated);
const isImpersonating = computed(() => !!localStorage.getItem('impersonate_user_id'));

const navigate = (name: string) => {
    router.push({ name });
};

const stopImpersonating = () => {
    localStorage.removeItem('impersonate_user_id');
    window.location.href = '/admin';
};
</script>

<template>
    <div
        v-if="isAuthenticated"
        class="pwa-mobile-show fixed right-0 bottom-0 left-0 z-50 border-t border-zinc-800 bg-black/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
    >
        <div class="flex h-16 w-full items-center justify-around px-2">
            <button
                @click="navigate('calendar')"
                class="flex h-full w-16 flex-col items-center justify-center gap-1 text-xs transition-colors"
                :class="route.name === 'calendar' ? 'text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'"
            >
                <i class="pi pi-calendar text-xl"></i>
                <span>Calendar</span>
            </button>
            <button
                @click="navigate('upcoming')"
                class="flex h-full w-16 flex-col items-center justify-center gap-1 text-xs transition-colors"
                :class="route.name === 'upcoming' ? 'text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'"
            >
                <i class="pi pi-list text-xl"></i>
                <span>Upcoming</span>
            </button>
            <button
                @click="navigate('profile')"
                class="flex h-full w-16 flex-col items-center justify-center gap-1 text-xs transition-colors"
                :class="route.name === 'profile' ? 'text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'"
            >
                <UserAvatar
                    :profilePictureUrl="currentUser?.profilePictureUrl"
                    :username="currentUser?.username"
                    class="size-6! text-[10px]"
                />
                <span>Profile</span>
            </button>
            <button
                v-if="isImpersonating"
                @click="stopImpersonating"
                class="flex h-full w-16 flex-col items-center justify-center gap-1 text-xs text-red-400 transition-colors hover:text-red-300"
            >
                <i class="pi pi-user-minus text-xl"></i>
                <span>Exit</span>
            </button>
        </div>
    </div>
</template>
