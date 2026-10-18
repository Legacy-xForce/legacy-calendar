import { precacheAndRoute } from 'workbox-precaching';
import { cleanupOutdatedCaches } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';
import { initializeApp } from 'firebase/app';
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw';
import { notificationStorage } from './services/notificationStorage';
import { createLogger } from './services/logger';
import { firebaseConfig } from './services/firebaseConfig';
import { isKnownNotificationCode, resolveNotificationRoute, shouldSuppressNotification } from './utils/notifications';

declare let self: ServiceWorkerGlobalScope;

self.skipWaiting();
clientsClaim();
cleanupOutdatedCaches();

precacheAndRoute(self.__WB_MANIFEST);

const app = initializeApp(firebaseConfig);
const messaging = getMessaging(app);
const logger = createLogger('ServiceWorker');

onBackgroundMessage(messaging, async (payload) => {
    logger.info('Received background message', payload);

    const type = payload.data?.type;
    if (type && !isKnownNotificationCode(type)) {
        logger.warn('Unknown notification type received in background', { type });
    }

    const settings = await notificationStorage.getSettings();
    if (shouldSuppressNotification(type, settings)) {
        logger.debug('Notification type disabled, skipping background notification', { type });
        return;
    }

    const notificationTitle = payload.notification?.title || payload.data?.title || 'New Message';
    const notificationOptions: NotificationOptions = {
        body: payload.notification?.body || payload.data?.body,
        icon: '/icon.png',
        data: payload.data
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
    logger.info('Background notification shown', {
        title: notificationTitle,
        type: type ?? null
    });
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const data = (event.notification.data || {}) as { type?: string; eventId?: string };
    const targetUrl = resolveNotificationRoute(data.type, data.eventId);

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windowClients) => {
            const client = windowClients[0];
            if (client && 'focus' in client) {
                await client.focus();
                if ('navigate' in client) {
                    await client.navigate(targetUrl);
                }
                return;
            }

            if (self.clients.openWindow) {
                await self.clients.openWindow(targetUrl);
            }
        })
    );
});
