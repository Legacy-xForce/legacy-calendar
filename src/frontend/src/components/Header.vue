<script setup lang="ts">
import { ref, computed } from 'vue';
import Badge from 'primevue/badge';
import UserAvatar from './UserAvatar.vue';
import Menubar from 'primevue/menubar';
import Button from 'primevue/button';

import { useSessionStore } from '../stores/session';
import { router } from '../router/router';
import { useRoute } from 'vue-router';

const sessionStore = useSessionStore();
const route = useRoute();

const isAuthenticated = computed(() => sessionStore.isAuthenticated);
const currentUser = computed(() => sessionStore.currentUser);
const isImpersonating = computed(() => !!localStorage.getItem('impersonate_user_id'));

const stopImpersonating = () => {
    localStorage.removeItem('impersonate_user_id');
    window.location.href = '/admin';
};

const items = ref([
    {
        label: 'Calendar',
        icon: 'pi pi-calendar',
        route: 'calendar',
        command: () => {
            router.push({ name: 'calendar' });
        }
    },
    {
        label: 'Upcoming',
        icon: 'pi pi-list',
        route: 'upcoming',
        command: () => {
            router.push({ name: 'upcoming' });
        }
    }
]);
</script>

<template>
    <Menubar :model="isAuthenticated ? items : []" class="pwa-mobile-hidden h-16!">
        <template #start>
            <router-link :to="{ name: 'calendar' }" class="flex cursor-pointer items-center text-inherit no-underline">
                <h1 class="ml-2 text-lg font-bold md:text-2xl">Legacy Calendar</h1>
            </router-link>
        </template>
        <template #item="{ item, props, hasSubmenu, root }">
            <a
                v-ripple
                class="flex items-center transition-colors"
                v-bind="props.action"
                :class="[route.name === item.route ? 'font-medium text-zinc-100!' : 'text-zinc-600!']"
            >
                <span>{{ item.label }}</span>
                <Badge v-if="item.badge" :class="{ 'ml-auto': !root, 'ml-2': root }" :value="item.badge" />
                <span
                    v-if="item.shortcut"
                    class="border-surface bg-emphasis text-muted-color ml-auto rounded border p-1 text-xs"
                >
                    {{ item.shortcut }}
                </span>
                <i
                    v-if="hasSubmenu"
                    :class="['pi pi-angle-down ml-auto', { 'pi-angle-down': root, 'pi-angle-right': !root }]"
                ></i>
            </a>
        </template>
        <template #end>
            <div v-if="isAuthenticated" class="flex items-center gap-2">
                <Button
                    v-if="isImpersonating"
                    label="Stop"
                    icon="pi pi-user-minus"
                    size="small"
                    severity="danger"
                    @click="stopImpersonating"
                    class="hidden rounded-xl! text-xs! sm:flex"
                    v-tooltip.bottom="'Stop Impersonating'"
                />
                <div
                    class="flex cursor-pointer items-center gap-2 rounded-full px-2 py-1 no-underline transition-all"
                    :class="[
                        route.name === 'profile' ? 'ring-1 ring-zinc-700' : '',
                        isImpersonating
                            ? 'bg-red-950/30 ring-1 ring-red-900/50 hover:bg-red-900/40'
                            : 'bg-zinc-900 hover:bg-zinc-800'
                    ]"
                    @click="router.push({ name: 'profile' })"
                >
                    <UserAvatar
                        :profilePictureUrl="currentUser?.profilePictureUrl"
                        :username="currentUser?.username"
                        class="transition-all hover:brightness-110"
                    />
                    <span class="hidden sm:inline">{{ currentUser?.username }}</span>
                </div>
            </div>
        </template>
    </Menubar>
</template>
