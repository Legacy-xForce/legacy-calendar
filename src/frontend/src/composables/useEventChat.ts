import { computed, onBeforeUnmount, ref, unref, watch, type Ref, type ComputedRef } from 'vue';
import { io, type Socket } from 'socket.io-client';
import api, { socketBaseURL, socketPath } from '../services/API';
import { useSessionStore } from '../stores/session';
import { createLogger } from '../services/logger';
import type {
    ChatEditedMessage,
    ChatHistoryResponse,
    ChatMessage,
    ChatMessageEventPayload,
    ChatReactionUpdatedPayload
} from '../types/Chat';

type MaybeRefNumber =
    | number
    | null
    | undefined
    | Ref<number | null | undefined>
    | ComputedRef<number | null | undefined>;

type TypingUser = {
    userId: number;
    username: string;
};

const PAGE_SIZE = 50;
const logger = createLogger('EventChat');

export function useEventChat(
    eventIdInput: MaybeRefNumber,
    options: { enabled?: Ref<boolean> | ComputedRef<boolean> } = {}
) {
    const sessionStore = useSessionStore();
    const eventId = computed(() => unref(eventIdInput) ?? null);
    const isEnabled = computed(() => unref(options.enabled) !== false);
    const messages = ref<ChatMessage[]>([]);
    const pinnedMessages = ref<ChatMessage[]>([]);
    const typingUsers = ref<TypingUser[]>([]);
    const loadingHistory = ref(false);
    const loadingPinned = ref(false);
    const loadingMore = ref(false);
    const sending = ref(false);
    const connected = ref(false);
    const connectionError = ref<string | null>(null);
    const nextCursor = ref<number | null>(null);
    const hasMore = ref(false);

    let socket: Socket | null = null;
    let eventRoomId: number | null = null;

    const currentUserId = computed(() => sessionStore.currentUser?.id ?? null);
    const currentUsername = computed(() => sessionStore.currentUser?.username ?? '');

    const reconnect = async () => {
        logger.info('Reconnecting chat');
        disconnect();
        await connect();
    };

    const connect = async () => {
        const id = eventId.value;
        const token = localStorage.getItem('token');
        if (!id || !token || !isEnabled.value) {
            logger.trace('Skipping chat connection', {
                eventId: id,
                hasToken: Boolean(token),
                enabled: isEnabled.value
            });
            return;
        }

        socket = io(socketBaseURL, {
            auth: { token },
            transports: ['websocket'],
            autoConnect: false,
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            path: socketPath
        });

        socket.on('connect', () => {
            connected.value = true;
            connectionError.value = null;
            logger.info('Chat socket connected', { eventId: id, socketId: socket?.id });
            socket?.emit('joinRoom', { eventId: id });
        });

        socket.on('disconnect', () => {
            connected.value = false;
            logger.warn('Chat socket disconnected', { eventId: id });
        });

        socket.on('connect_error', (error) => {
            connectionError.value = error.message || 'Failed to connect to chat';
            logger.error('Chat socket connect error', error);
        });

        socket.on('error', (error: { message?: string }) => {
            connectionError.value = error?.message || 'Chat error';
            logger.warn('Chat socket error', error);
        });

        socket.on('newMessage', (message: ChatMessageEventPayload) => {
            const normalized = normalizeMessage(message);
            upsertMessage(normalized);
            if (normalized.isPinned) {
                upsertPinnedMessage(normalized);
            }
        });

        socket.on('reactionUpdated', (payload: ChatReactionUpdatedPayload) => {
            updateMessage(payload.messageId, { reactions: payload.reactions });
            updatePinnedMessage(payload.messageId, { reactions: payload.reactions });
        });

        socket.on('messagePinned', ({ messageId }: { messageId: number }) => {
            updateMessage(messageId, { isPinned: true });
            markPinned(messageId, true);
        });

        socket.on('messageUnpinned', ({ messageId }: { messageId: number }) => {
            updateMessage(messageId, { isPinned: false });
            markPinned(messageId, false);
        });

        socket.on('messageDeleted', ({ messageId }: { messageId: number }) => {
            messages.value = messages.value.filter((message) => message.id !== messageId);
            pinnedMessages.value = pinnedMessages.value.filter((message) => message.id !== messageId);
        });

        socket.on('messageEdited', (message: ChatEditedMessage) => {
            const normalized = normalizeMessage(message);
            updateMessage(normalized.id, {
                ...normalized,
                isPinned: normalized.isPinned
            });
            updatePinnedMessage(normalized.id, {
                ...normalized,
                isPinned: normalized.isPinned
            });
        });

        socket.on('userTyping', (user: TypingUser) => {
            if (user.userId === currentUserId.value) return;
            if (!typingUsers.value.some((typingUser) => typingUser.userId === user.userId)) {
                typingUsers.value = [...typingUsers.value, user];
            }
        });

        socket.on('userStoppedTyping', (user: TypingUser) => {
            typingUsers.value = typingUsers.value.filter((typingUser) => typingUser.userId !== user.userId);
        });

        socket.connect();
        eventRoomId = id;
    };

    const disconnect = () => {
        typingUsers.value = [];
        connected.value = false;
        if (socket) {
            try {
                if (eventRoomId) {
                    socket.emit('leaveRoom', { eventId: eventRoomId });
                }
                socket.removeAllListeners();
                socket.disconnect();
            } catch {
                // Best effort cleanup.
                logger.warn('Chat socket cleanup failed');
            }
        }
        socket = null;
        eventRoomId = null;
        logger.debug('Chat socket disconnected locally');
    };

    const loadHistory = async () => {
        const id = eventId.value;
        if (!id || !isEnabled.value) return;

        loadingHistory.value = true;
        try {
            logger.debug('Loading chat history', { eventId: id });
            const response = await api.getChatHistory(id, undefined, PAGE_SIZE);
            applyHistory(response.data);
        } catch (error: any) {
            connectionError.value = error?.response?.data?.message || 'Failed to load chat history';
            logger.warn('Failed to load chat history', {
                eventId: id,
                status: error?.response?.status,
                message: error?.response?.data?.message ?? error.message
            });
        } finally {
            loadingHistory.value = false;
        }
    };

    const loadPinnedMessages = async () => {
        const id = eventId.value;
        if (!id || !isEnabled.value) return;

        loadingPinned.value = true;
        try {
            logger.debug('Loading pinned chat messages', { eventId: id });
            const response = await api.getPinnedChatMessages(id);
            pinnedMessages.value = dedupeMessages(response.data.map(normalizeMessage)).sort(sortMessagesAsc);
        } catch (error: any) {
            connectionError.value = error?.response?.data?.message || 'Failed to load pinned messages';
            logger.warn('Failed to load pinned messages', {
                eventId: id,
                status: error?.response?.status,
                message: error?.response?.data?.message ?? error.message
            });
        } finally {
            loadingPinned.value = false;
        }
    };

    const loadMoreHistory = async () => {
        if (!hasMore.value || loadingMore.value || nextCursor.value == null) return;

        const id = eventId.value;
        if (!id) return;

        loadingMore.value = true;
        try {
            logger.debug('Loading more chat history', { eventId: id, cursor: nextCursor.value });
            const response = await api.getChatHistory(id, nextCursor.value, PAGE_SIZE);
            const nextPage = response.data.messages.map(normalizeMessage).sort(sortMessagesAsc);
            messages.value = dedupeMessages([...nextPage, ...messages.value]).sort(sortMessagesAsc);
            nextCursor.value = response.data.nextCursor;
            hasMore.value = response.data.nextCursor !== null;
        } finally {
            loadingMore.value = false;
        }
    };

    const sendMessage = async (text: string, media?: { file: File; text?: string }) => {
        const id = eventId.value;
        const token = localStorage.getItem('token');
        if (!id || !token || !socket) {
            throw new Error('Chat is not connected');
        }

        const trimmedText = text.trim();
        const hasMedia = !!media?.file;
        if (!trimmedText && !hasMedia) {
            return;
        }

        sending.value = true;
        try {
            logger.info('Sending chat message', { eventId: id, hasMedia });
            let mediaUrl: string | null = null;
            let mediaType: string | null = null;

            if (media?.file) {
                const upload = await api.uploadChatMedia(id, media.file);
                mediaUrl = upload.data.mediaUrl;
                mediaType = upload.data.mediaType;
            }

            socket.emit('sendMessage', {
                eventId: id,
                text: trimmedText || media?.text || '',
                mediaUrl,
                mediaType
            });
            logger.debug('Chat message emitted', { eventId: id, hasMedia });
        } finally {
            sending.value = false;
        }
    };

    const toggleReaction = (messageId: number, emoji: string) => {
        logger.debug('Toggling reaction', { eventId: eventId.value, messageId, emoji });
        socket?.emit('addReaction', { messageId, emoji });
    };

    const pinMessage = (messageId: number) => {
        logger.warn('Pinning message', { eventId: eventId.value, messageId });
        socket?.emit('pinMessage', { messageId });
    };

    const unpinMessage = (messageId: number) => {
        logger.warn('Unpinning message', { eventId: eventId.value, messageId });
        socket?.emit('unpinMessage', { messageId });
    };

    const deleteMessage = (messageId: number) => {
        logger.warn('Deleting message', { eventId: eventId.value, messageId });
        socket?.emit('deleteMessage', { messageId });
    };

    const editMessage = (messageId: number, text: string) => {
        logger.info('Editing message', { eventId: eventId.value, messageId });
        socket?.emit('editMessage', { messageId, text });
    };

    const startTyping = () => {
        if (eventId.value) {
            logger.trace('Typing started', { eventId: eventId.value });
            socket?.emit('typing', { eventId: eventId.value });
        }
    };

    const stopTyping = () => {
        if (eventId.value) {
            logger.trace('Typing stopped', { eventId: eventId.value });
            socket?.emit('stopTyping', { eventId: eventId.value });
        }
    };

    const applyHistory = (history: ChatHistoryResponse) => {
        const normalized = history.messages.map(normalizeMessage).sort(sortMessagesAsc);
        messages.value = dedupeMessages([...messages.value, ...normalized]).sort(sortMessagesAsc);
        nextCursor.value = history.nextCursor;
        hasMore.value = history.nextCursor !== null;
    };

    const upsertMessage = (message: ChatMessage) => {
        messages.value = dedupeMessages([...messages.value, message]).sort(sortMessagesAsc);
    };

    const upsertPinnedMessage = (message: ChatMessage) => {
        if (!message.isPinned) return;
        pinnedMessages.value = dedupeMessages([...pinnedMessages.value, message]).sort(sortMessagesAsc);
    };

    const updateMessage = (messageId: number, patch: Partial<ChatMessage>) => {
        messages.value = messages.value.map((message) =>
            message.id === messageId ? { ...message, ...patch } : message
        );
    };

    const updatePinnedMessage = (messageId: number, patch: Partial<ChatMessage>) => {
        pinnedMessages.value = pinnedMessages.value.map((message) =>
            message.id === messageId ? { ...message, ...patch } : message
        );
    };

    const markPinned = (messageId: number, isPinned: boolean) => {
        if (!isPinned) {
            pinnedMessages.value = pinnedMessages.value.filter((message) => message.id !== messageId);
            return;
        }

        const existing = messages.value.find((message) => message.id === messageId);
        if (existing && !pinnedMessages.value.some((message) => message.id === messageId)) {
            pinnedMessages.value = dedupeMessages([...pinnedMessages.value, existing]).sort(sortMessagesAsc);
        }
    };

    watch(
        [eventId, isEnabled],
        async ([nextId, nextEnabled], [prevId, prevEnabled]) => {
            if (nextId === prevId && nextEnabled === prevEnabled) return;

            logger.debug('Chat event or enabled state changed', {
                previousEventId: prevId,
                nextEventId: nextId,
                enabled: nextEnabled
            });

            disconnect();
            messages.value = [];
            pinnedMessages.value = [];
            nextCursor.value = null;
            hasMore.value = false;

            if (!nextId || !nextEnabled) {
                return;
            }

            await Promise.all([loadHistory(), loadPinnedMessages()]);
            await connect();
        },
        { immediate: true }
    );

    onBeforeUnmount(() => {
        disconnect();
    });

    return {
        messages,
        pinnedMessages,
        typingUsers,
        loadingHistory,
        loadingPinned,
        loadingMore,
        sending,
        connected,
        connectionError,
        hasMore,
        currentUserId,
        currentUsername,
        loadMoreHistory,
        sendMessage,
        toggleReaction,
        pinMessage,
        unpinMessage,
        deleteMessage,
        editMessage,
        startTyping,
        stopTyping,
        reconnect
    };
}

function normalizeMessage(message: ChatMessageEventPayload): ChatMessage {
    return {
        ...message,
        authorProfilePictureUrl: message.authorProfilePictureUrl ?? null,
        createdAt: message.createdAt instanceof Date ? message.createdAt.toISOString() : message.createdAt,
        ...(message && 'updatedAt' in message && message.updatedAt
            ? { updatedAt: message.updatedAt instanceof Date ? message.updatedAt.toISOString() : message.updatedAt }
            : {})
    } as ChatMessage;
}

function sortMessagesAsc(a: ChatMessage, b: ChatMessage) {
    const aTime = new Date(a.createdAt).getTime();
    const bTime = new Date(b.createdAt).getTime();

    if (aTime !== bTime) {
        return aTime - bTime;
    }

    return a.id - b.id;
}

function dedupeMessages(messages: ChatMessage[]) {
    const byId = new Map<number, ChatMessage>();
    for (const message of messages) {
        byId.set(message.id, message);
    }
    return [...byId.values()];
}
