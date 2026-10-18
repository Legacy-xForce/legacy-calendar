<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';
import { router } from './router/router';
import Header from './components/Header.vue';
import BottomBar from './components/BottomBar.vue';
import Toast from 'primevue/toast';
import ConfirmDialog from 'primevue/confirmdialog';
import { useSessionStore } from './stores/session';
import { onMessageListener, requestNotificationPermission } from './services/firebase';
import { useToast } from 'primevue/usetoast';
import { notificationStorage } from './services/notificationStorage';
import { createLogger } from './services/logger';
import { isKnownNotificationCode, resolveNotificationRoute, shouldSuppressNotification } from './utils/notifications';
import { useSheetGestures } from './composables/useSheetGestures';

useSheetGestures();

const route = useRoute();
const toast = useToast();
const sessionStore = useSessionStore();
const logger = createLogger('App');
// Wait for the first route to resolve so standalone pages don't flash the app chrome
const showHeader = computed(() => route.matched.length > 0 && !route.meta.bare);

type ForegroundNotification = {
    id: number;
    title: string;
    body: string;
    route: string;
    type?: string;
};

const foregroundNotifications = ref<ForegroundNotification[]>([]);
let nextForegroundNotificationId = 0;
const foregroundTimers = new Map<number, number>();

const dismissForegroundNotification = (id: number) => {
    const timer = foregroundTimers.get(id);
    if (timer) {
        window.clearTimeout(timer);
        foregroundTimers.delete(id);
    }

    const index = foregroundNotifications.value.findIndex((item) => item.id === id);
    if (index !== -1) {
        foregroundNotifications.value.splice(index, 1);
    }
};

const pushForegroundNotification = (title: string, body: string, type?: string, eventId?: string) => {
    const id = ++nextForegroundNotificationId;
    const route = resolveNotificationRoute(type, eventId);
    foregroundNotifications.value.unshift({ id, title, body, route, type });

    const timer = window.setTimeout(() => dismissForegroundNotification(id), 5000);
    foregroundTimers.set(id, timer);
};

onMounted(async () => {
    // Check for session expired flag
    if (localStorage.getItem('session_expired') === 'true') {
        localStorage.removeItem('session_expired');
        toast.add({
            severity: 'warn',
            summary: 'Signed out',
            detail: 'Your session ran out. Sign in again to pick up where you left off.',
            life: 5000
        });
    }

    const loaded = await sessionStore.load();

    if (loaded) {
        // Register for notifications if logged in
        requestNotificationPermission();

        // If we loaded a session and we are on the login page, redirect to calendar
        if (route.name === 'login') {
            router.push('/calendar');
        }
    }

    // Set up foreground notification listener
    onMessageListener(async (payload) => {
        const type = payload.data?.type;
        const eventId = payload.data?.eventId;
        const title = payload.notification?.title || payload.data?.title || 'New Notification';
        const body = payload.notification?.body || payload.data?.body || 'You have a new message';
        const settings = await notificationStorage.getSettings();

        if (type && !isKnownNotificationCode(type)) {
            logger.warn('Unknown foreground notification type received', { type });
        }

        if (shouldSuppressNotification(type, settings)) {
            logger.debug('Foreground notification suppressed by settings', { type });
            return;
        }

        pushForegroundNotification(title, body, type, eventId);
    });

    // get the page's title and add "(DEV)" to it if in dev mode
    if (import.meta.env.DEV) {
        document.title = `${document.title} (DEV)`;
    }
});

onBeforeUnmount(() => {
    for (const timer of foregroundTimers.values()) {
        window.clearTimeout(timer);
    }
    foregroundTimers.clear();
});

const openForegroundNotification = (notification: ForegroundNotification) => {
    dismissForegroundNotification(notification.id);
    void router.push(notification.route);
};

const transitionName = computed(() => {
    const from = router.previousRoute?.name as string;
    const to = route.name as string;

    const order: Record<string, number> = {
        calendar: 1,
        upcoming: 2,
        profile: 3,
        admin: 4
    };

    if (!from || !to || !order[from] || !order[to]) return 'fade';

    return order[to] > order[from] ? 'slide-left' : 'slide-right';
});
</script>

<template>
    <Toast position="top-right" />
    <ConfirmDialog />
    <TransitionGroup
        tag="div"
        name="banner"
        class="fixed top-[calc(env(safe-area-inset-top)+0.75rem)] right-3 left-3 z-1200 flex flex-col gap-2 sm:left-auto sm:w-[22rem]"
    >
        <button
            v-for="notification in foregroundNotifications"
            :key="notification.id"
            type="button"
            class="pressable border-line bg-overlay hover:border-line-strong flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left shadow-[0_18px_40px_-18px_rgb(0_0_0/0.9)]"
            @click="openForegroundNotification(notification)"
        >
            <span class="bg-accent-soft text-accent flex size-9 shrink-0 items-center justify-center rounded-xl">
                <i class="pi pi-bell text-sm"></i>
            </span>
            <span class="min-w-0 flex-1">
                <span class="text-body text-fg block truncate font-semibold">{{ notification.title }}</span>
                <span class="text-meta text-muted mt-0.5 line-clamp-2 block">{{ notification.body }}</span>
            </span>
            <i class="pi pi-chevron-right text-subtle mt-2.5 text-xs"></i>
        </button>
    </TransitionGroup>
    <Header v-if="showHeader" />
    <main
        class="relative block w-full overflow-x-hidden"
        :class="
            showHeader
                ? 'pt-[env(safe-area-inset-top)] pb-[calc(var(--tabbar-height)+env(safe-area-inset-bottom))] lg:pt-0 lg:pb-0'
                : ''
        "
    >
        <router-view v-slot="{ Component }">
            <transition :name="transitionName" mode="out-in">
                <component :is="Component" />
            </transition>
        </router-view>
    </main>
    <BottomBar v-if="showHeader" />
</template>

<style scoped>
.banner-enter-active {
    transition:
        opacity 220ms var(--ease-out-quart),
        transform 380ms var(--ease-out-expo);
}

.banner-leave-active {
    transition:
        opacity 160ms var(--ease-in-quart),
        transform 160ms var(--ease-in-quart);
}

.banner-enter-from,
.banner-leave-to {
    opacity: 0;
    transform: translateY(-12px);
}
</style>
