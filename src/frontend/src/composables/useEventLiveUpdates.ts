import { onBeforeUnmount, watch, type Ref } from 'vue';
import { io, type Socket } from 'socket.io-client';
import { socketBaseURL, socketPath } from '../services/API';
import { useSessionStore } from '../stores/session';
import { createLogger } from '../services/logger';

const logger = createLogger('EventLiveUpdates');

/**
 * Calls `onChanged` whenever someone else changes the watched event (joins, leaves,
 * rides, edits...). The server only signals; the caller refetches what it shows.
 */
export function useEventLiveUpdates(
    eventId: Ref<number | null>,
    onChanged: (eventId: number) => void,
    onChatChanged?: (eventId: number) => void
) {
    let socket: Socket | null = null;
    let watchedId: number | null = null;

    const disconnect = () => {
        socket?.removeAllListeners();
        socket?.disconnect();
        socket = null;
        watchedId = null;
    };

    const connect = (id: number) => {
        socket = io(socketBaseURL, {
            // A function, so every reconnect presents a fresh access token.
            auth: (callback) => {
                void useSessionStore()
                    .getAccessToken()
                    .then((token) => callback({ token }));
            },
            transports: ['websocket'],
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            path: socketPath
        });
        watchedId = id;

        let hasConnected = false;
        socket.on('connect', () => {
            socket?.emit('watchEvent', { eventId: id });
            // Changes made while we were offline were never signalled.
            if (hasConnected) {
                onChanged(id);
                onChatChanged?.(id);
            }
            hasConnected = true;
        });
        socket.on('eventChanged', (payload: { eventId: number }) => {
            if (payload.eventId === id) onChanged(id);
        });
        socket.on('chatChanged', (payload: { eventId: number }) => {
            if (payload.eventId === id) onChatChanged?.(id);
        });
        socket.on('connect_error', (error) => logger.warn('Live update socket error', { message: error.message }));
    };

    watch(
        eventId,
        (id) => {
            if (id === watchedId) return;
            disconnect();
            if (id !== null) connect(id);
        },
        { immediate: true }
    );

    onBeforeUnmount(disconnect);
}
