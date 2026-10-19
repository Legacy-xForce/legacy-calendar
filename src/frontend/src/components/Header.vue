<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import UserAvatar from './UserAvatar.vue';
import AppLogo from './AppLogo.vue';
import { useSessionStore } from '../stores/session';
import { HEADER_NAVIGATION, stopImpersonating } from '../constants/navigation';

const sessionStore = useSessionStore();
const route = useRoute();

const isAuthenticated = computed(() => sessionStore.isAuthenticated);
const currentUser = computed(() => sessionStore.currentUser);
const isImpersonating = computed(() => !!localStorage.getItem('impersonate_user_id'));

const items = HEADER_NAVIGATION;
</script>

<template>
    <header
        class="pwa-mobile-hidden border-line bg-canvas/85 sticky top-0 z-40 h-(--app-header-height) border-b backdrop-blur-md"
    >
        <div class="flex h-full items-center gap-8 px-6">
            <router-link :to="{ name: 'calendar' }" class="text-fg flex items-center gap-2.5 no-underline">
                <AppLogo class="size-6" />
                <span class="font-display text-title font-semibold tracking-tight">Legacy</span>
            </router-link>

            <nav v-if="isAuthenticated" class="flex items-center gap-1" aria-label="Main">
                <router-link
                    v-for="item in items"
                    :key="item.name"
                    :to="{ name: item.name }"
                    class="text-body pressable rounded-full px-3.5 py-1.5 font-medium no-underline"
                    :class="item.match(route.path) ? 'bg-surface-850 text-fg' : 'text-muted hover:text-fg'"
                    :aria-current="item.match(route.path) ? 'page' : undefined"
                >
                    {{ item.label }}
                </router-link>
            </nav>

            <div v-if="isAuthenticated" class="ml-auto flex items-center gap-2">
                <button
                    v-if="isImpersonating"
                    type="button"
                    class="pressable text-meta flex items-center gap-2 rounded-full border border-rose-400/30 bg-rose-400/10 px-3 py-1.5 font-medium text-rose-300 hover:bg-rose-400/15"
                    @click="stopImpersonating"
                >
                    <i class="pi pi-eye text-xs"></i>
                    Viewing as {{ currentUser?.username }}
                    <span class="text-rose-200 underline underline-offset-2">Exit</span>
                </button>
                <router-link
                    :to="{ name: 'profile' }"
                    class="pressable text-body flex items-center gap-2.5 rounded-full py-1 pr-3.5 pl-1 font-medium no-underline"
                    :class="
                        route.name === 'profile'
                            ? 'bg-surface-850 text-fg'
                            : 'text-muted hover:bg-surface-900 hover:text-fg'
                    "
                >
                    <UserAvatar
                        :profilePictureUrl="currentUser?.profilePictureUrl"
                        :username="currentUser?.username"
                        class="size-7!"
                    />
                    <span>{{ currentUser?.username }}</span>
                </router-link>
            </div>
        </div>
    </header>
</template>
