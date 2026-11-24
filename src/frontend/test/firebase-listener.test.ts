import { expect, mock, test } from 'bun:test';

(globalThis as { window?: unknown }).window = globalThis;

let unsubscribed = false;

await mock.module('firebase/app', () => ({ initializeApp: () => ({}) }));
await mock.module('firebase/analytics', () => ({ getAnalytics: () => ({}) }));
await mock.module('firebase/messaging', () => ({
    getMessaging: () => ({}),
    getToken: () => Promise.resolve('token'),
    onMessage: () => () => {
        unsubscribed = true;
    }
}));
await mock.module('../src/services/logger', () => ({
    createLogger: () => ({ info: () => {}, debug: () => {}, trace: () => {}, warn: () => {}, error: () => {} })
}));
await mock.module('../src/services/firebaseConfig', () => ({
    firebaseConfig: { measurementId: 'test' },
    vapidKey: 'test'
}));

const { onMessageListener } = await import('../src/services/firebase.js');

test('foreground FCM listener exposes its unsubscribe function', () => {
    const unsubscribe = onMessageListener(() => {});
    expect(typeof unsubscribe).toBe('function');
    unsubscribe?.();
    expect(unsubscribed).toBe(true);
});
