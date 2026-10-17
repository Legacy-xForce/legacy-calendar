import {
    computed,
    inject,
    nextTick,
    onBeforeUnmount,
    provide,
    ref,
    watch,
    type ComputedRef,
    type InjectionKey,
    type Ref
} from 'vue';
import { format, formatDistanceToNowStrict, isToday, isYesterday, parseISO } from 'date-fns';
import { useConfirm } from 'primevue/useconfirm';
import { useToast } from 'primevue/usetoast';
import type { Event as CalendarEvent } from '../../../../types/Event';
import type { ChatMessage } from '../../../../types/Chat';
import { useEventChat } from '../../../../composables/useEventChat';
import { useSessionStore } from '../../../../stores/session';
import { uploadsBaseURL } from '../../../../services/API';
import API from '../../../../services/API';
import { hasLocalChatAccess } from '../../../../utils/event';

type EventRef = Ref<CalendarEvent | null>;

type TypingTimer = ReturnType<typeof window.setTimeout> | null;

export interface EventChatDialogState {
    event: EventRef;
    title: ComputedRef<string>;
    subtitle: ComputedRef<string>;
    chat: ReturnType<typeof useEventChat>;
    canAccessChat: ComputedRef<boolean>;
    currentUserId: ComputedRef<number | null>;
    canModerate: ComputedRef<boolean>;
    messagesContainer: Ref<HTMLElement | null>;
    fileInput: Ref<HTMLInputElement | null>;
    selectedFile: Ref<File | null>;
    selectedFilePreviewUrl: Ref<string | null>;
    draftText: Ref<string>;
    previewFileLabel: ComputedRef<string>;
    previewFileType: ComputedRef<string>;
    sortedPinnedMessages: ComputedRef<ChatMessage[]>;
    timelineRows: ComputedRef<Array<{ type: 'divider'; label: string } | { type: 'message'; message: ChatMessage }>>;
    emojiChoices: string[];
    reactionPickerMessageId: Ref<number | null>;
    isEditDialogVisible: ComputedRef<boolean>;
    editingDraft: Ref<string>;
    isChatMuted: Ref<boolean>;
    muteStateLoading: Ref<boolean>;
    loadOlderMessages: () => Promise<void>;
    handleMuteToggle: (nextValue: boolean) => Promise<void>;
    closePicker: () => void;
    toggleReactionPicker: (messageId: number) => void;
    onPickEmoji: (messageId: number, emoji: string) => void;
    openEditDialog: (messageId: number) => void;
    closeEditDialog: () => void;
    saveEdit: () => void;
    confirmDelete: (messageId: number) => void;
    togglePin: (messageId: number, isPinned: boolean) => void;
    chooseFile: (event: globalThis.Event) => void;
    clearSelectedFile: () => void;
    triggerFilePicker: () => void;
    emitTyping: () => void;
    sendCurrentMessage: () => Promise<void>;
    setDraftText: (value: string) => void;
    scrollToMessage: (messageId: number) => Promise<void>;
    onScroll: () => void;
    formatMessageTime: (value: string | Date) => string;
    resolveMediaUrl: (mediaUrl: string | null) => string;
    getMediaKind: (mediaType: string | null) => string;
    loadMuteState: () => Promise<void>;
    closeChat: () => void;
}

const EventChatDialogKey: InjectionKey<EventChatDialogState> = Symbol('EventChatDialogState');

export function useEventChatDialogState(eventRef: EventRef, closeChat: () => void, isOpen?: Ref<boolean>) {
    const sessionStore = useSessionStore();
    const confirm = useConfirm();
    const toast = useToast();

    const currentUserId = computed(() => sessionStore.currentUser?.id ?? null);
    const canAccessChat = computed(() => hasLocalChatAccess(eventRef.value, currentUserId.value));

    const chat = useEventChat(
        computed(() => eventRef.value?.id ?? null),
        {
            enabled: canAccessChat
        }
    );
    const messagesContainer = ref<HTMLElement | null>(null);
    const fileInput = ref<HTMLInputElement | null>(null);
    const selectedFile = ref<File | null>(null);
    const selectedFilePreviewUrl = ref<string | null>(null);
    const draftText = ref('');
    const typingTimer = ref<TypingTimer>(null);
    const editingMessageId = ref<number | null>(null);
    const editingDraft = ref('');
    const reactionPickerMessageId = ref<number | null>(null);
    const suppressAutoScroll = ref(false);
    const isScrolledToBottom = ref(true);
    const chatInitialized = ref(false);
    const isChatMuted = ref(false);
    const muteStateLoading = ref(false);

    const currentUserIsAdmin = computed(() => !!sessionStore.currentUser?.isAdmin);
    const currentEventHostId = computed(() => eventRef.value?.hostId ?? null);
    const canModerate = computed(
        () =>
            currentUserIsAdmin.value ||
            (currentUserId.value != null && currentUserId.value === currentEventHostId.value)
    );

    const title = computed(() => eventRef.value?.title || 'Event Chat');
    const subtitle = computed(() => {
        if (!eventRef.value) return 'Live chat';
        return `${chat.connected.value ? 'Connected' : 'Connecting'} · ${chat.messages.value.length} messages`;
    });

    const sortedPinnedMessages = computed(() => [...chat.pinnedMessages.value].sort(sortByDateAsc));

    const timelineRows = computed(() => {
        const rows: Array<{ type: 'divider'; label: string } | { type: 'message'; message: ChatMessage }> = [];
        let lastLabel: string | null = null;

        for (const message of chat.messages.value) {
            const label = getDateLabel(message.createdAt);
            if (label !== lastLabel) {
                rows.push({ type: 'divider', label });
                lastLabel = label;
            }

            rows.push({ type: 'message', message });
        }

        return rows;
    });

    const previewFileLabel = computed(() => selectedFile.value?.name || '');
    const previewFileType = computed(() => selectedFile.value?.type || '');
    const isEditDialogVisible = computed({
        get: () => editingMessageId.value !== null,
        set: (visible: boolean) => {
            if (!visible) {
                closeEditDialog();
            }
        }
    });

    const scrollToBottom = async () => {
        await nextTick();
        const container = messagesContainer.value;
        if (!container) return;
        container.scrollTop = container.scrollHeight;
        isScrolledToBottom.value = true;
    };

    const scrollToMessage = async (messageId: number) => {
        await nextTick();
        const element = messagesContainer.value?.querySelector(`[data-message-id="${messageId}"]`);
        if (element instanceof HTMLElement) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    };

    const closePicker = () => {
        reactionPickerMessageId.value = null;
    };

    const toggleReactionPicker = (messageId: number) => {
        reactionPickerMessageId.value = reactionPickerMessageId.value === messageId ? null : messageId;
    };

    const onPickEmoji = (messageId: number, emoji: string) => {
        chat.toggleReaction(messageId, emoji);
        reactionPickerMessageId.value = null;
    };

    const openEditDialog = (messageId: number) => {
        const message = chat.messages.value.find((item) => item.id === messageId);
        if (!message) return;
        editingMessageId.value = messageId;
        editingDraft.value = message.text || '';
    };

    const closeEditDialog = () => {
        editingMessageId.value = null;
        editingDraft.value = '';
    };

    const saveEdit = () => {
        if (!editingMessageId.value) return;
        const nextText = editingDraft.value.trim();
        if (!nextText) {
            toast.add({
                severity: 'warn',
                summary: 'Empty message',
                detail: 'Edited messages need some text.',
                life: 3000
            });
            return;
        }

        chat.editMessage(editingMessageId.value, nextText);
        editingMessageId.value = null;
        editingDraft.value = '';
    };

    const confirmDelete = (messageId: number) => {
        confirm.require({
            message: 'Delete this message? This cannot be undone.',
            header: 'Delete Message',
            icon: 'pi pi-trash',
            rejectProps: { label: 'Cancel', severity: 'secondary', text: true },
            acceptProps: { label: 'Delete', severity: 'danger' },
            accept: () => chat.deleteMessage(messageId)
        });
    };

    const togglePin = (messageId: number, isPinned: boolean) => {
        if (isPinned) {
            chat.unpinMessage(messageId);
        } else {
            chat.pinMessage(messageId);
        }
    };

    const chooseFile = (event: globalThis.Event) => {
        const input = event.target as HTMLInputElement | null;
        const file = input?.files?.[0] ?? null;
        selectedFile.value = file;

        if (selectedFilePreviewUrl.value) {
            URL.revokeObjectURL(selectedFilePreviewUrl.value);
            selectedFilePreviewUrl.value = null;
        }

        if (file && file.type.startsWith('image/')) {
            selectedFilePreviewUrl.value = URL.createObjectURL(file);
        }
    };

    const clearSelectedFile = () => {
        selectedFile.value = null;
        if (selectedFilePreviewUrl.value) {
            URL.revokeObjectURL(selectedFilePreviewUrl.value);
            selectedFilePreviewUrl.value = null;
        }
    };

    const emitTyping = () => {
        chat.startTyping();

        if (typingTimer.value) {
            window.clearTimeout(typingTimer.value);
        }

        typingTimer.value = window.setTimeout(() => {
            chat.stopTyping();
        }, 1200);
    };

    const sendCurrentMessage = async () => {
        const text = draftText.value.trim();
        if (!text && !selectedFile.value) return;

        try {
            await chat.sendMessage(text, selectedFile.value ? { file: selectedFile.value } : undefined);
            draftText.value = '';
            clearSelectedFile();
            chat.stopTyping();
            await scrollToBottom();
        } catch (error) {
            toast.add({
                severity: 'error',
                summary: 'Chat error',
                detail: error instanceof Error ? error.message : 'Failed to send message',
                life: 4000
            });
        }
    };

    const loadOlderMessages = async () => {
        const container = messagesContainer.value;
        if (!container) {
            await chat.loadMoreHistory();
            return;
        }

        const previousHeight = container.scrollHeight;
        const previousTop = container.scrollTop;
        suppressAutoScroll.value = true;
        await chat.loadMoreHistory();
        await nextTick();
        container.scrollTop = previousTop + (container.scrollHeight - previousHeight);
    };

    const onScroll = () => {
        const container = messagesContainer.value;
        if (!container) return;
        const remaining = container.scrollHeight - container.scrollTop - container.clientHeight;
        isScrolledToBottom.value = remaining < 120;
    };

    watch(
        () => chat.messages.value.length,
        async () => {
            if (suppressAutoScroll.value) {
                suppressAutoScroll.value = false;
                return;
            }

            if (isScrolledToBottom.value) {
                await scrollToBottom();
            }
        }
    );

    watch(
        () => chat.connectionError.value,
        (error) => {
            if (!error) return;
            toast.add({
                severity: 'warn',
                summary: 'Chat connection',
                detail: error,
                life: 4000
            });
        }
    );

    watch(
        () => chat.loadingHistory.value,
        (isLoading, wasLoading) => {
            if (wasLoading && !isLoading) {
                // Delay setting initialized to true to avoid showing toast for the initial batch of messages
                // that arrived in the same tick as the loading state change.
                nextTick(() => {
                    chatInitialized.value = true;
                });
            }
        }
    );

    watch(
        () => chat.messages.value[chat.messages.value.length - 1]?.id,
        (messageId, previousMessageId) => {
            if (!chatInitialized.value || !messageId || messageId === previousMessageId) return;

            const message = chat.messages.value[chat.messages.value.length - 1];
            if (!message || message.authorId === currentUserId.value) return;

            // The message is already on screen while the chat is open
            const isReadingChat = !!isOpen?.value && !document.hidden;
            if (!isReadingChat) {
                toast.add({
                    severity: 'info',
                    summary: `${message.authorUsername} sent a message`,
                    detail:
                        message.text || (message.mediaType ? `${message.mediaType} attachment` : 'New chat activity'),
                    life: 3500
                });
            }

            if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
                new Notification(`New message from ${message.authorUsername}`, {
                    body:
                        message.text ||
                        (message.mediaType ? `${message.mediaType} attachment` : 'Open the chat to view it'),
                    tag: `chat-message-${message.id}`
                });
            }
        }
    );

    const loadMuteState = async () => {
        if (!eventRef.value?.id) {
            isChatMuted.value = false;
            return;
        }

        try {
            const response = await API.getMutedChatEvents();
            isChatMuted.value = response.data.includes(eventRef.value.id);
        } catch {
            isChatMuted.value = false;
        }
    };

    const handleMuteToggle = async (nextValue: boolean) => {
        if (!eventRef.value?.id || muteStateLoading.value) {
            return;
        }

        const previousValue = isChatMuted.value;
        isChatMuted.value = nextValue;
        muteStateLoading.value = true;

        try {
            if (nextValue) {
                await API.muteChatNotifications(eventRef.value.id);
            } else {
                await API.unmuteChatNotifications(eventRef.value.id);
            }
        } catch {
            isChatMuted.value = previousValue;
            toast.add({
                severity: 'error',
                summary: 'Chat mute',
                detail: nextValue ? 'Failed to mute chat notifications' : 'Failed to unmute chat notifications',
                life: 4000
            });
        } finally {
            muteStateLoading.value = false;
        }
    };

    watch(
        () => eventRef.value?.id,
        async () => {
            chatInitialized.value = false;
            draftText.value = '';
            clearSelectedFile();
            editingMessageId.value = null;
            editingDraft.value = '';
            reactionPickerMessageId.value = null;
            await loadMuteState();
        },
        { immediate: true }
    );

    onBeforeUnmount(() => {
        if (typingTimer.value) {
            window.clearTimeout(typingTimer.value);
        }

        if (selectedFilePreviewUrl.value) {
            URL.revokeObjectURL(selectedFilePreviewUrl.value);
        }

        chat.stopTyping();
    });

    const state: EventChatDialogState = {
        event: eventRef,
        title,
        subtitle,
        chat,
        canAccessChat,
        currentUserId,
        canModerate,
        messagesContainer,
        fileInput,
        selectedFile,
        selectedFilePreviewUrl,
        draftText,
        previewFileLabel,
        previewFileType,
        sortedPinnedMessages,
        timelineRows,
        emojiChoices: ['👍', '❤️', '😂', '🎉', '🔥', '🙏'],
        reactionPickerMessageId,
        isEditDialogVisible,
        editingDraft,
        isChatMuted,
        muteStateLoading,
        loadOlderMessages,
        handleMuteToggle,
        closePicker,
        toggleReactionPicker,
        onPickEmoji,
        openEditDialog,
        closeEditDialog,
        saveEdit,
        confirmDelete,
        togglePin,
        chooseFile,
        clearSelectedFile,
        triggerFilePicker: () => {
            fileInput.value?.click();
        },
        emitTyping,
        sendCurrentMessage,
        setDraftText: (value: string) => {
            draftText.value = value;
        },
        scrollToMessage,
        onScroll,
        formatMessageTime: (value: string | Date) => {
            const date = typeof value === 'string' ? parseISO(value) : value;
            return formatDistanceToNowStrict(date, { addSuffix: true });
        },
        resolveMediaUrl: (mediaUrl: string | null) => {
            if (!mediaUrl) return '';
            if (/^https?:\/\//i.test(mediaUrl)) return mediaUrl;
            const base = uploadsBaseURL.replace(/\/$/, '');
            return `${base}/${mediaUrl.replace(/^\//, '')}`;
        },
        getMediaKind: (mediaType: string | null) => mediaType || 'file',
        loadMuteState,
        closeChat
    };

    provide(EventChatDialogKey, state);
    return state;
}

export function injectEventChatDialogState() {
    const state = inject(EventChatDialogKey);
    if (!state) {
        throw new Error('useEventChatDialogState must be provided');
    }
    return state;
}

function getDateLabel(value: string | Date) {
    const date = typeof value === 'string' ? parseISO(value) : value;
    if (isToday(date)) return 'Today';
    if (isYesterday(date)) return 'Yesterday';
    return format(date, 'EEEE, d MMMM');
}

function sortByDateAsc<T extends { createdAt: string | Date }>(a: T, b: T) {
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
}
