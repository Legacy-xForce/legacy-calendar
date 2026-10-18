import { initializeApp } from 'firebase/app';
import { getAnalytics } from 'firebase/analytics';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { createLogger } from './logger';
import { firebaseConfig, vapidKey } from './firebaseConfig';

const logger = createLogger('Firebase');

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = typeof window !== 'undefined' && firebaseConfig.measurementId ? getAnalytics(app) : null;
const messaging = typeof window !== 'undefined' ? getMessaging(app) : null;

export const requestNotificationPermission = async () => {
    if (!messaging) return;

    try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            logger.info('Notification permission granted');

            // Wait for the service worker to be ready
            const registration = await navigator.serviceWorker.ready;

            // Get FCM Token
            const token = await getToken(messaging, {
                vapidKey,
                serviceWorkerRegistration: registration
            });
            if (token) {
                localStorage.setItem('fcm_token', token);
                // Send the token to your server if needed
                const { default: API } = await import('./API');
                await API.subscribeNotifications(token);
                logger.info('FCM token registered on server');
            } else {
                logger.warn('No registration token available');
            }
        } else {
            logger.warn('Unable to get permission to notify');
        }
    } catch (error) {
        logger.error('An error occurred while retrieving token', error);
    }
};

export const onMessageListener = (callback: (payload: any) => void) => {
    if (!messaging) return;
    onMessage(messaging, (payload) => {
        logger.debug('Message received in foreground', payload);
        callback(payload);
    });
};

export { app, analytics, messaging };
