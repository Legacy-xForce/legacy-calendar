/**
 * Single source of truth for the Firebase client configuration.
 *
 * Both the app entry (`services/firebase.ts`) and the service worker (`sw.ts`)
 * import this, so the config lives in exactly one place and is supplied through
 * Vite env vars at build time instead of being duplicated in source.
 */

export const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

export const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
