<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { useSessionStore } from '../stores/session';
import UserAvatar from './UserAvatar.vue';

const route = useRoute();
const sessionStore = useSessionStore();
const currentUser = computed(() => sessionStore.currentUser);
const isAuthenticated = computed(() => sessionStore.isAuthenticated);
const isImpersonating = computed(() => !!localStorage.getItem('impersonate_user_id'));

const tabs = [
    {
        name: 'calendar',
        label: 'Calendar',
        icon: 'pi pi-calendar',
        match: (path: string) => path === '/calendar' || path.startsWith('/event')
    },
    { name: 'upcoming', label: 'Upcoming', icon: 'pi pi-list', match: (path: string) => path.startsWith('/upcoming') },
    { name: 'profile', label: 'Profile', icon: null, match: (path: string) => path === '/profile' || path === '/admin' }
];

const stopImpersonating = () => {
    localStorage.removeItem('impersonate_user_id');
    window.location.href = '/admin';
};
</script>

<template>
    <nav
        v-if="isAuthenticated"
        class="pwa-mobile-show border-line fixed right-0 bottom-0 left-0 z-50 border-t bg-black/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
        aria-label="Main"
    >
        <div class="mx-auto flex h-(--tabbar-height) max-w-md items-stretch justify-around px-2">
            <router-link
                v-for="tab in tabs"
                :key="tab.name"
                :to="{ name: tab.name }"
                class="group flex flex-1 flex-col items-center justify-center gap-1 no-underline"
                :class="tab.match(route.path) ? 'text-fg' : 'text-subtle'"
                :aria-current="tab.match(route.path) ? 'page' : undefined"
            >
                <span
                    class="flex h-7 w-14 items-center justify-center rounded-full transition-colors duration-200 group-active:scale-95"
                    :class="tab.match(route.path) ? 'bg-surface-850' : ''"
                >
                    <i v-if="tab.icon" :class="tab.icon" class="text-[1.125rem]"></i>
                    <UserAvatar
                        v-else
                        :profilePictureUrl="currentUser?.profilePictureUrl"
                        :username="currentUser?.username"
                        class="size-[1.375rem]! text-[0.625rem]!"
                        :class="tab.match(route.path) ? 'ring-fg ring-1' : ''"
                    />
                </span>
                <span class="text-[0.6875rem] leading-none font-medium">{{ tab.label }}</span>
            </router-link>
            <button
                v-if="isImpersonating"
                type="button"
                class="group flex flex-1 flex-col items-center justify-center gap-1 text-rose-300"
                @click="stopImpersonating"
            >
                <span class="flex h-7 w-14 items-center justify-center rounded-full bg-rose-400/10">
                    <i class="pi pi-eye-slash text-[1.125rem]"></i>
                </span>
                <span class="text-[0.6875rem] leading-none font-medium">Exit view</span>
            </button>
        </div>
    </nav>
</template>
