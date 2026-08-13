import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';

// Lazy load views
const Calendar = () => import('../views/Calendar.vue');
const Login = () => import('../views/Login.vue');
const AdminView = () => import('../views/AdminView.vue');
const Profile = () => import('../views/Profile.vue');
const Upcoming = () => import('../views/Upcoming.vue');
const ErrorPage = () => import('../views/ErrorPage.vue');
const GuestInviteView = () => import('../views/GuestInviteView.vue');

declare module 'vue-router' {
    interface RouteMeta {
        requiresAuth?: boolean;
        requiresGuest?: boolean;
        requiresAdmin?: boolean;
    }
}

const routes: RouteRecordRaw[] = [
    { path: '/', name: 'login', component: Login, meta: { requiresGuest: true } },
    {
        path: '/calendar',
        name: 'calendar',
        component: Calendar,
        meta: { requiresAuth: true }
    },
    {
        path: '/upcoming',
        name: 'upcoming',
        component: Upcoming,
        meta: { requiresAuth: true }
    },
    { path: '/event/:id', name: 'calendar-event', component: Calendar, meta: { requiresAuth: true } },
    { path: '/event/:id/chat', name: 'calendar-event-chat', component: Calendar, meta: { requiresAuth: true } },
    {
        path: '/event/:id/audit-log',
        name: 'calendar-event-audit-log',
        component: Calendar,
        meta: { requiresAuth: true }
    },
    { path: '/event/:id/map', name: 'calendar-event-map', component: Calendar, meta: { requiresAuth: true } },
    { path: '/event/:id/edit', name: 'calendar-event-edit', component: Calendar, meta: { requiresAuth: true } },
    { path: '/upcoming/:id', name: 'upcoming-event', component: Upcoming, meta: { requiresAuth: true } },
    { path: '/upcoming/:id/chat', name: 'upcoming-event-chat', component: Upcoming, meta: { requiresAuth: true } },
    {
        path: '/upcoming/:id/audit-log',
        name: 'upcoming-event-audit-log',
        component: Upcoming,
        meta: { requiresAuth: true }
    },
    { path: '/upcoming/:id/edit', name: 'upcoming-event-edit', component: Upcoming, meta: { requiresAuth: true } },
    { path: '/admin', name: 'admin', component: AdminView, meta: { requiresAuth: true, requiresAdmin: true } },
    { path: '/invite/:token', name: 'guest-invite', component: GuestInviteView },
    { path: '/profile', name: 'profile', component: Profile, meta: { requiresAuth: true } },
    { path: '/403', name: 'forbidden', component: ErrorPage, props: { status: 403 } },
    { path: '/404', name: 'not-found', component: ErrorPage, props: { status: 404 } },
    { path: '/:pathMatch(.*)*', component: ErrorPage, props: { status: 404 } }
];

export const router = createRouter({
    history: createWebHistory(),
    routes
}) as any;

router.previousRoute = null;

// Navigation guards
router.beforeEach(async (to: any, from: any) => {
    router.previousRoute = from;
    const token = localStorage.getItem('token');
    const isAuthenticated = !!token;

    // Redirect to login if route requires auth and user is not authenticated
    if (to.meta.requiresAuth && !isAuthenticated) {
        return { name: 'login' };
    }

    // Redirect to calendar if user is already authenticated and tries to access login
    if (to.meta.requiresGuest && isAuthenticated) {
        return { name: 'calendar' };
    }

    // Redirect to calendar if route requires admin and user is not an admin
    if (to.meta.requiresAdmin) {
        const { useSessionStore } = await import('../stores/session');
        const sessionStore = useSessionStore();

        // Ensure session is loaded before checking admin status
        if (!sessionStore.currentUser) {
            await sessionStore.load();
        }

        if (!sessionStore.currentUser?.isAdmin) {
            return { name: 'calendar' };
        }
    }

    return;
});
