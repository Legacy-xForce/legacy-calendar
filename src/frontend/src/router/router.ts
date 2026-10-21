import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { redirectToLogin } from '../services/auth';

// Lazy load views
const Calendar = () => import('../views/Calendar.vue');
const AdminView = () => import('../views/AdminView.vue');
const Profile = () => import('../views/Profile.vue');
const Upcoming = () => import('../views/Upcoming.vue');
const ErrorPage = () => import('../views/ErrorPage.vue');
const GuestInviteView = () => import('../views/GuestInviteView.vue');
const DisabledAccountView = () => import('../views/DisabledAccountView.vue');
const InsufficientScopeView = () => import('../views/InsufficientScopeView.vue');
const DocsView = () => import('../views/DocsView.vue');

declare module 'vue-router' {
    interface RouteMeta {
        requiresAuth?: boolean;
        requiresAdmin?: boolean;
        /** Standalone page without the app header and tab bar */
        bare?: boolean;
    }
}

const routes: RouteRecordRaw[] = [
    // There is no sign-in page: signing in happens at Legacy Auth (see services/auth.ts).
    { path: '/', name: 'home', redirect: { name: 'calendar' } },
    { path: '/disabled', name: 'disabled-account', component: DisabledAccountView, meta: { bare: true } },
    {
        path: '/insufficient-scope',
        name: 'insufficient-scope',
        component: InsufficientScopeView,
        meta: { bare: true }
    },
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
    { path: '/invite/:token', name: 'guest-invite', component: GuestInviteView, meta: { bare: true } },
    { path: '/profile', name: 'profile', component: Profile, meta: { requiresAuth: true } },
    { path: '/docs', name: 'docs', component: DocsView },
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

    if (!to.meta.requiresAuth && !to.meta.requiresAdmin) {
        return;
    }

    const { useSessionStore } = await import('../stores/session');
    const sessionStore = useSessionStore();

    if (!(await sessionStore.load())) {
        if (sessionStore.error) {
            // The API is unreachable; signing in again would not help.
            return { name: 'forbidden' };
        }
        // No session: sign in at Legacy Auth and come back here.
        return redirectToLogin(to.fullPath) ? false : { name: 'forbidden' };
    }

    if (to.meta.requiresAdmin && !sessionStore.currentUser?.isAdmin) {
        return { name: 'calendar' };
    }

    return;
});
