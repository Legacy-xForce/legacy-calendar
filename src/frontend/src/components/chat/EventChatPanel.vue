<script setup lang="ts">
import { injectEventChatDialogState } from '../calendar/event-view/chat/useEventChatDialogState';
import Button from 'primevue/button';
import ContextMenu from 'primevue/contextmenu';
import Dialog from 'primevue/dialog';
import Menu from 'primevue/menu';
import Popover from 'primevue/popover';
import Textarea from 'primevue/textarea';
import UserAvatar from '../UserAvatar.vue';
import { ref, computed } from 'vue';
import { format, parseISO } from 'date-fns';
import type { ChatMessage } from '../../types/Chat';
import EmojiPicker from 'vue3-emoji-picker';
import 'vue3-emoji-picker/css';

const chatState = injectEventChatDialogState();
const {
    messagesContainer,
    chat,
    sortedPinnedMessages,
    timelineRows,
    currentUserId,
    canModerate,
    resolveMediaUrl,
    getMediaKind,
    scrollToMessage,
    onScroll,
    loadOlderMessages,
    onPickEmoji,
    emojiChoices,
    openEditDialog,
    confirmDelete,
    togglePin,
    isEditDialogVisible,
    editingDraft,
    saveEdit,
    closeEditDialog
} = chatState;

// The template binds this as a ref; `void` keeps noUnusedLocals happy.
void messagesContainer;

const menu = ref();
const contextMenu = ref();
const op = ref();
const selectedMessageId = ref<number | null>(null);
const activeReactionMessageId = ref<number | null>(null);

const onMenuToggle = (event: globalThis.Event, messageId: number) => {
    selectedMessageId.value = messageId;
    menu.value.toggle(event);
};

const onContextMenu = (event: MouseEvent, messageId: number) => {
    selectedMessageId.value = messageId;
    contextMenu.value.show(event);
};

const onReactionToggle = (event: globalThis.Event, messageId: number) => {
    activeReactionMessageId.value = messageId;
    op.value.toggle(event);
};

const menuItems = computed(() => {
    if (selectedMessageId.value === null) return [];
    const message = chat.messages.value.find((m) => m.id === selectedMessageId.value);
    if (!message) return [];

    const items = [];

    if (message.authorId === currentUserId.value) {
        items.push({
            label: 'Edit',
            icon: 'pi pi-pencil',
            command: () => openEditDialog(message.id)
        });
    }

    if (canModerate.value) {
        items.push({
            label: message.isPinned ? 'Unpin' : 'Pin',
            icon: message.isPinned ? 'pi pi-bookmark-fill' : 'pi pi-bookmark',
            command: () => togglePin(message.id, message.isPinned)
        });
    }

    if (message.authorId === currentUserId.value || canModerate.value) {
        items.push({
            label: 'Delete',
            icon: 'pi pi-trash',
            class: 'text-red-500',
            command: () => confirmDelete(message.id)
        });
    }

    return items;
});

const GROUP_GAP_MS = 5 * 60 * 1000;

const clockTime = (value: string | Date) => format(typeof value === 'string' ? parseISO(value) : value, 'HH:mm');

/** Consecutive messages from the same person within a few minutes read as one group. */
const groupedRows = computed(() => {
    const rows = timelineRows.value;
    return rows.map((row, index) => {
        if (row.type !== 'message') return { ...row, first: false, last: false };
        const sameGroup = (other: (typeof rows)[number] | undefined) =>
            other?.type === 'message' &&
            other.message.authorId === row.message.authorId &&
            Math.abs(new Date(other.message.createdAt).getTime() - new Date(row.message.createdAt).getTime()) <
                GROUP_GAP_MS;
        return { ...row, first: !sameGroup(rows[index - 1]), last: !sameGroup(rows[index + 1]) };
    });
});

const isMine = (message: ChatMessage) => message.authorId === currentUserId.value;
const canManage = (message: ChatMessage) => isMine(message) || canModerate.value;

// Touch devices have no hover: tapping a message reveals its actions
const activeMessageId = ref<number | null>(null);
const toggleActive = (messageId: number) => {
    activeMessageId.value = activeMessageId.value === messageId ? null : messageId;
};

const onEmojiSelect = (emoji: any) => {
    if (activeReactionMessageId.value !== null) {
        onPickEmoji(activeReactionMessageId.value, emoji.i);
        op.value.hide();
    }
};
</script>

<template>
    <div class="flex h-full min-h-0 flex-col overflow-hidden">
        <section v-if="sortedPinnedMessages.length" class="border-line border-b px-3 py-2">
            <div class="no-scrollbar flex gap-2 overflow-x-auto">
                <button
                    v-for="message in sortedPinnedMessages"
                    :key="message.id"
                    type="button"
                    class="pressable bg-surface-900 hover:bg-surface-850 flex max-w-[16rem] min-w-0 shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-left"
                    @click="scrollToMessage(message.id)"
                >
                    <i class="pi pi-thumbtack text-[0.6875rem] text-amber-200"></i>
                    <span class="text-meta min-w-0 truncate">
                        <span class="text-fg font-semibold">{{ message.authorUsername }}:</span>
                        <span class="text-muted ml-1">{{ message.text || 'Attachment' }}</span>
                    </span>
                </button>
            </div>
        </section>

        <div class="relative min-h-0 flex-1">
            <div ref="messagesContainer" class="h-full overflow-y-auto px-3 py-4 sm:px-5" @scroll="onScroll">
                <div
                    v-if="chat.loadingHistory.value && !chat.messages.value.length"
                    class="text-muted flex h-full items-center justify-center gap-2"
                >
                    <i class="pi pi-spin pi-spinner"></i>
                    <span class="text-meta">Loading messages…</span>
                </div>

                <div v-else-if="chat.messages.value.length" class="flex flex-col">
                    <div v-if="chat.hasMore.value" class="flex justify-center pb-3">
                        <button
                            type="button"
                            class="pressable text-meta text-muted hover:text-fg bg-surface-900 rounded-full px-3.5 py-1.5 font-medium"
                            :disabled="chat.loadingMore.value"
                            @click="loadOlderMessages"
                        >
                            <i v-if="chat.loadingMore.value" class="pi pi-spin pi-spinner mr-1.5 text-[0.6875rem]"></i>
                            Load earlier messages
                        </button>
                    </div>

                    <template
                        v-for="row in groupedRows"
                        :key="row.type === 'divider' ? `divider-${row.label}` : `message-${row.message.id}`"
                    >
                        <div v-if="row.type === 'divider'" class="text-meta text-subtle py-3 text-center font-medium">
                            {{ row.label }}
                        </div>

                        <article
                            v-else
                            :data-message-id="row.message.id"
                            class="group flex items-end gap-2"
                            :class="[isMine(row.message) ? 'flex-row-reverse' : '', row.last ? 'mb-3' : 'mb-0.5']"
                        >
                            <!-- Avatar lines up with the last bubble, above its timestamp -->
                            <div v-if="!isMine(row.message)" class="w-7 shrink-0" :class="row.last ? 'mb-5' : ''">
                                <UserAvatar
                                    v-if="row.last"
                                    :username="row.message.authorUsername"
                                    :profilePictureUrl="row.message.authorProfilePictureUrl"
                                    class="size-7! text-[0.6875rem]!"
                                />
                            </div>

                            <div
                                class="flex max-w-[80%] min-w-0 flex-col sm:max-w-[70%]"
                                :class="isMine(row.message) ? 'items-end' : 'items-start'"
                                @contextmenu.prevent="canManage(row.message) && onContextMenu($event, row.message.id)"
                            >
                                <span
                                    v-if="row.first && !isMine(row.message)"
                                    class="text-meta text-muted mb-1 ml-3 font-medium"
                                >
                                    {{ row.message.authorUsername }}
                                </span>

                                <div
                                    class="bubble overflow-hidden text-left"
                                    :class="[
                                        isMine(row.message) ? 'bubble-mine' : 'bubble-theirs',
                                        row.first ? 'bubble-first' : '',
                                        row.last ? 'bubble-last' : ''
                                    ]"
                                    @click="toggleActive(row.message.id)"
                                >
                                    <template v-if="row.message.mediaUrl">
                                        <img
                                            v-if="
                                                getMediaKind(row.message.mediaType) === 'image' ||
                                                getMediaKind(row.message.mediaType) === 'gif'
                                            "
                                            :src="resolveMediaUrl(row.message.mediaUrl)"
                                            class="block max-h-80 max-w-full object-cover"
                                            :alt="`Photo from ${row.message.authorUsername}`"
                                            loading="lazy"
                                        />
                                        <video
                                            v-else-if="getMediaKind(row.message.mediaType) === 'video'"
                                            :src="resolveMediaUrl(row.message.mediaUrl)"
                                            controls
                                            playsinline
                                            class="block max-h-80 max-w-full"
                                        />
                                        <audio
                                            v-else-if="getMediaKind(row.message.mediaType) === 'audio'"
                                            :src="resolveMediaUrl(row.message.mediaUrl)"
                                            controls
                                            class="m-2 w-64 max-w-full"
                                        />
                                        <a
                                            v-else
                                            :href="resolveMediaUrl(row.message.mediaUrl)"
                                            target="_blank"
                                            rel="noreferrer"
                                            class="text-body text-accent block px-3.5 py-2 underline"
                                        >
                                            Open attachment
                                        </a>
                                    </template>
                                    <p
                                        v-if="row.message.text"
                                        class="text-body m-0 px-3.5 py-2 break-words whitespace-pre-wrap"
                                    >
                                        {{ row.message.text }}
                                    </p>
                                </div>

                                <div
                                    v-if="row.message.reactions.length"
                                    class="-mt-1 flex flex-wrap gap-1 px-1.5"
                                    :class="isMine(row.message) ? 'justify-end' : ''"
                                >
                                    <button
                                        v-for="reaction in row.message.reactions"
                                        :key="`${row.message.id}-${reaction.emoji}`"
                                        type="button"
                                        class="pressable ring-raised flex h-6 items-center gap-1 rounded-full px-1.5 text-[0.75rem] ring-2"
                                        :class="
                                            currentUserId !== null && reaction.userIds.includes(currentUserId)
                                                ? 'bg-emerald-400/20 text-emerald-200'
                                                : 'bg-surface-850 text-muted'
                                        "
                                        @click="onPickEmoji(row.message.id, reaction.emoji)"
                                    >
                                        <span class="font-emoji">{{ reaction.emoji }}</span>
                                        <span class="tabular font-medium">{{ reaction.count }}</span>
                                    </button>
                                </div>

                                <div
                                    v-if="row.last || row.message.isPinned || row.message.isEdited"
                                    class="text-subtle mt-1 flex items-center gap-1.5 px-1.5 text-[0.6875rem]"
                                >
                                    <i
                                        v-if="row.message.isPinned"
                                        class="pi pi-thumbtack text-[0.5625rem] text-amber-200"
                                    ></i>
                                    <span v-if="row.message.isEdited">Edited ·</span>
                                    <span class="tabular">{{ clockTime(row.message.createdAt) }}</span>
                                </div>
                            </div>

                            <div
                                class="message-actions mb-1 flex shrink-0 items-center gap-0.5 self-center"
                                :class="{ 'is-active': activeMessageId === row.message.id }"
                            >
                                <button
                                    type="button"
                                    class="text-subtle hover:text-fg hover:bg-surface-850 flex size-8 items-center justify-center rounded-full"
                                    aria-label="Add reaction"
                                    @click="onReactionToggle($event, row.message.id)"
                                >
                                    <i class="pi pi-face-smile text-sm"></i>
                                </button>
                                <button
                                    v-if="canManage(row.message)"
                                    type="button"
                                    class="text-subtle hover:text-fg hover:bg-surface-850 flex size-8 items-center justify-center rounded-full"
                                    aria-label="More actions"
                                    @click="onMenuToggle($event, row.message.id)"
                                >
                                    <i class="pi pi-ellipsis-h text-sm"></i>
                                </button>
                            </div>
                        </article>
                    </template>
                </div>

                <div v-else class="flex h-full flex-col items-center justify-center gap-2 text-center">
                    <i class="pi pi-comments text-subtle text-2xl"></i>
                    <p class="text-title text-fg m-0 font-semibold">No messages yet</p>
                    <p class="text-meta text-muted m-0 max-w-xs">
                        Kick things off. Photos, videos and voice clips work too.
                    </p>
                </div>
            </div>

            <Transition name="fade">
                <div
                    v-if="chat.typingUsers.value.length"
                    class="bg-surface-900 text-meta text-muted absolute bottom-3 left-3 flex items-center gap-2 rounded-full px-3 py-1.5"
                >
                    <span class="typing-dots" aria-hidden="true"><span></span><span></span><span></span></span>
                    {{ chat.typingUsers.value.map((user) => user.username).join(', ') }}
                    {{ chat.typingUsers.value.length === 1 ? 'is' : 'are' }} typing
                </div>
            </Transition>
        </div>

        <Dialog
            v-model:visible="isEditDialogVisible"
            modal
            header="Edit message"
            :style="{ width: 'min(32rem, calc(100vw - 2rem))' }"
            :dismissableMask="true"
        >
            <Textarea v-model="editingDraft" auto-resize rows="3" class="w-full" aria-label="Message" />
            <template #footer>
                <Button label="Cancel" severity="secondary" text @click="closeEditDialog" />
                <Button label="Save" icon="pi pi-check" @click="saveEdit" />
            </template>
        </Dialog>

        <Menu ref="menu" :model="menuItems" :popup="true" />
        <ContextMenu ref="contextMenu" :model="menuItems" />

        <Popover
            ref="op"
            :pt="{
                root: { class: 'rounded-2xl! overflow-hidden!' },
                content: { class: 'p-0!' }
            }"
        >
            <div class="flex max-h-[28rem] flex-col overflow-hidden">
                <div class="border-line flex gap-1 border-b p-2">
                    <button
                        v-for="emoji in emojiChoices"
                        :key="emoji"
                        type="button"
                        class="pressable hover:bg-surface-800 flex size-10 items-center justify-center rounded-xl text-xl"
                        :aria-label="`React with ${emoji}`"
                        @click="
                            onPickEmoji(activeReactionMessageId!, emoji);
                            op.hide();
                        "
                    >
                        <span class="font-emoji">{{ emoji }}</span>
                    </button>
                </div>
                <EmojiPicker :native="true" theme="dark" :hide-group-names="false" @select="onEmojiSelect" />
            </div>
        </Popover>
    </div>
</template>

<style scoped>
.bubble {
    border-radius: 1.125rem;
    transition: background-color 160ms var(--ease-out-quart);
}

.bubble-theirs {
    background: var(--color-surface-900);
    color: var(--color-fg);
}

.bubble-mine {
    background: color-mix(in oklab, var(--color-accent) 22%, var(--color-surface-925));
    color: var(--color-fg);
}

/* Tighter corners where bubbles in a group touch */
.bubble-theirs:not(.bubble-first) {
    border-top-left-radius: 0.375rem;
}
.bubble-theirs:not(.bubble-last) {
    border-bottom-left-radius: 0.375rem;
}
.bubble-mine:not(.bubble-first) {
    border-top-right-radius: 0.375rem;
}
.bubble-mine:not(.bubble-last) {
    border-bottom-right-radius: 0.375rem;
}

.message-actions {
    opacity: 0;
    pointer-events: none;
    transition: opacity 140ms var(--ease-out-quart);
}

.message-actions.is-active {
    opacity: 1;
    pointer-events: auto;
}

@media (hover: hover) {
    article:hover .message-actions {
        opacity: 1;
        pointer-events: auto;
    }
}

.typing-dots {
    display: inline-flex;
    gap: 3px;
}

.typing-dots span {
    width: 4px;
    height: 4px;
    border-radius: 999px;
    background: currentColor;
    animation: typing 1.2s var(--ease-out-quart) infinite;
}

.typing-dots span:nth-child(2) {
    animation-delay: 0.15s;
}

.typing-dots span:nth-child(3) {
    animation-delay: 0.3s;
}

@keyframes typing {
    0%,
    60%,
    100% {
        opacity: 0.3;
        transform: translateY(0);
    }
    30% {
        opacity: 1;
        transform: translateY(-2px);
    }
}

/* Emoji picker, matched to the surface tokens */
:deep(.v3-emoji-picker) {
    --v3-bg: var(--color-surface-900) !important;
    --v3-border-color: transparent !important;
    --v3-text-color: var(--color-fg) !important;
    --v3-input-bg: var(--color-surface-850) !important;
    --v3-input-border-color: var(--color-line) !important;
    --v3-input-text-color: var(--color-fg) !important;
    --v3-input-placeholder-color: var(--color-subtle) !important;
    --v3-group-h-bg: var(--color-surface-900) !important;
    --v3-hover-bg: var(--color-surface-800) !important;
    width: 20rem;
    height: 22rem;
    border-radius: 0;
    box-shadow: none;
    font-family: inherit;
    background-color: var(--color-surface-900) !important;
}

:deep(.v3-header) {
    padding: 0.625rem 0.625rem 0.375rem;
    border-bottom: 0;
}

:deep(.v3-emoji-picker input) {
    border-radius: 0.75rem !important;
    padding: 0.5rem 0.75rem !important;
    font-size: 1rem !important;
    width: 100% !important;
}

:deep(.v3-emoji-picker input:focus) {
    border-color: var(--color-accent) !important;
    outline: none !important;
}

:deep(.v3-body-inner) {
    padding: 0 0.625rem !important;
}

:deep(.v3-group h5) {
    font-size: 0.75rem !important;
    font-weight: 600 !important;
    color: var(--color-muted) !important;
    padding: 0.5rem 0 !important;
    margin: 0 !important;
    background-color: var(--color-surface-900) !important;
}

:deep(.v3-footer) {
    display: none;
}
</style>
