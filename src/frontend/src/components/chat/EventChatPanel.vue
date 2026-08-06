<script setup lang="ts">
import { injectEventChatDialogState } from '../calendar/event-view/chat/useEventChatDialogState';
import Button from 'primevue/button';
import ContextMenu from 'primevue/contextmenu';
import Dialog from 'primevue/dialog';
import Menu from 'primevue/menu';
import Popover from 'primevue/popover';
import Tag from 'primevue/tag';
import Textarea from 'primevue/textarea';
import UserAvatar from '../UserAvatar.vue';
import { ref, computed } from 'vue';
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
    formatMessageTime,
    resolveMediaUrl,
    getMediaKind,
    scrollToMessage,
    onScroll,
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

const onEmojiSelect = (emoji: any) => {
    if (activeReactionMessageId.value !== null) {
        onPickEmoji(activeReactionMessageId.value, emoji.i);
        op.value.hide();
    }
};
</script>

<template>
    <div class="flex h-full min-h-0 flex-col overflow-hidden rounded-none border-0 bg-transparent">
        <section
            v-if="sortedPinnedMessages.length"
            class="bg-surface-950/70 px-4 py-3 shadow-[0_1px_0_rgba(255,255,255,0.03)]"
        >
            <div class="mb-2 flex items-center gap-2 text-amber-200">
                <i class="pi pi-thumbtack"></i>
                <span class="text-sm font-semibold">Pinned messages</span>
            </div>
            <div class="flex gap-2 overflow-x-auto pb-1">
                <button
                    v-for="message in sortedPinnedMessages"
                    :key="message.id"
                    class="bg-surface-900/90 min-w-[220px] rounded-2xl p-3 text-left shadow-[0_0_0_1px_rgba(255,255,255,0.04)] transition hover:shadow-[0_0_0_1px_rgba(59,130,246,0.22)]"
                    @click="scrollToMessage(message.id)"
                >
                    <div class="mb-1 flex items-center justify-between gap-2">
                        <span class="truncate text-sm font-semibold">{{ message.authorUsername }}</span>
                        <span class="text-surface-500 text-[11px]">{{ formatMessageTime(message.createdAt) }}</span>
                    </div>
                    <p class="text-surface-300 m-0 line-clamp-2 text-xs">
                        {{ message.text || `${message.mediaType || 'media'} message` }}
                    </p>
                </button>
            </div>
        </section>

        <div class="relative min-h-0 flex-1">
            <div ref="messagesContainer" class="bg-surface-950/80 h-full overflow-y-auto px-4 py-4" @scroll="onScroll">
                <div
                    v-if="chat.loadingHistory.value && !chat.messages.value.length"
                    class="flex h-full items-center justify-center py-24"
                >
                    <div class="text-surface-500 flex items-center gap-3">
                        <i class="pi pi-spin pi-spinner text-xl"></i>
                        <span>Loading chat…</span>
                    </div>
                </div>

                <div v-else-if="chat.messages.value.length" class="space-y-4">
                    <div
                        v-for="row in timelineRows"
                        :key="row.type === 'divider' ? `divider-${row.label}` : `message-${row.message.id}`"
                    >
                        <div v-if="row.type === 'divider'" class="py-1.5 text-center">
                            <span
                                class="rounded-full border border-zinc-800/80 bg-zinc-950/95 px-3 py-1 text-[11px] font-semibold tracking-[0.2em] text-zinc-400 uppercase"
                            >
                                {{ row.label }}
                            </span>
                        </div>

                        <article
                            v-else
                            :data-message-id="row.message.id"
                            class="group flex gap-2.5 rounded-2xl p-2.5 shadow-[0_0_0_1px_rgba(255,255,255,0.035)] transition"
                            :class="
                                row.message.authorId === currentUserId
                                    ? 'bg-primary-500/12 shadow-[0_0_0_1px_rgba(59,130,246,0.18)]'
                                    : 'bg-surface-900/95'
                            "
                        >
                            <UserAvatar
                                :username="row.message.authorUsername"
                                :profilePictureUrl="undefined"
                                class="shrink-0"
                            />
                            <div
                                class="relative min-w-0 flex-1"
                                @contextmenu.prevent="onContextMenu($event, row.message.id)"
                            >
                                <div class="mb-1.5 flex flex-wrap items-center gap-2 pr-8">
                                    <span class="truncate text-sm font-bold">{{ row.message.authorUsername }}</span>
                                    <span class="text-surface-500 text-[11px]">{{
                                        formatMessageTime(row.message.createdAt)
                                    }}</span>
                                    <Tag v-if="row.message.isPinned" severity="warning" value="Pinned" />
                                    <Tag v-if="row.message.isEdited" severity="info" value="Edited" />

                                    <Button
                                        v-if="row.message.authorId === currentUserId || canModerate"
                                        icon="pi pi-ellipsis-h"
                                        text
                                        rounded
                                        severity="secondary"
                                        class="absolute! -top-1 -right-1 h-8! w-8! transition"
                                        @click="onMenuToggle($event, row.message.id)"
                                    />
                                </div>

                                <div class="space-y-2.5">
                                    <div
                                        v-if="row.message.text"
                                        class="px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap"
                                    >
                                        {{ row.message.text }}
                                    </div>

                                    <div
                                        v-if="row.message.mediaUrl"
                                        class="mt-2 w-fit overflow-hidden rounded-xl bg-black/25 shadow-[0_0_0_1px_rgba(255,255,255,0.04)]"
                                    >
                                        <template
                                            v-if="
                                                getMediaKind(row.message.mediaType) === 'image' ||
                                                getMediaKind(row.message.mediaType) === 'gif'
                                            "
                                        >
                                            <img
                                                :src="resolveMediaUrl(row.message.mediaUrl)"
                                                class="block max-h-[340px] max-w-full object-contain"
                                                :alt="row.message.mediaType || 'chat media'"
                                            />
                                        </template>
                                        <template v-else-if="getMediaKind(row.message.mediaType) === 'video'">
                                            <video
                                                :src="resolveMediaUrl(row.message.mediaUrl)"
                                                controls
                                                class="block max-w-full"
                                            />
                                        </template>
                                        <template v-else-if="getMediaKind(row.message.mediaType) === 'audio'">
                                            <audio
                                                :src="resolveMediaUrl(row.message.mediaUrl)"
                                                controls
                                                class="w-full"
                                            />
                                        </template>
                                        <a
                                            v-else
                                            :href="resolveMediaUrl(row.message.mediaUrl)"
                                            target="_blank"
                                            rel="noreferrer"
                                            class="text-primary-300 block px-3 py-2 text-sm underline"
                                        >
                                            Open attachment
                                        </a>
                                    </div>

                                    <div class="flex flex-wrap gap-2">
                                        <button
                                            v-for="reaction in row.message.reactions"
                                            :key="`${row.message.id}-${reaction.emoji}`"
                                            class="bg-surface-900/95 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs shadow-[0_0_0_1px_rgba(255,255,255,0.04)] transition hover:shadow-[0_0_0_1px_rgba(59,130,246,0.22)]"
                                            @click="onPickEmoji(row.message.id, reaction.emoji)"
                                        >
                                            <span class="font-emoji">{{ reaction.emoji }}</span>
                                            <span>{{ reaction.count }}</span>
                                        </button>

                                        <button
                                            class="bg-surface-900/95 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs shadow-[0_0_0_1px_rgba(255,255,255,0.04)] transition hover:shadow-[0_0_0_1px_rgba(59,130,246,0.22)]"
                                            @click="onReactionToggle($event, row.message.id)"
                                        >
                                            <i class="pi pi-face-smile text-xs! text-zinc-400"></i>
                                            <span class="text-surface-400 font-bold">+</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </article>
                    </div>
                </div>

                <div
                    v-else
                    class="text-surface-500 flex min-h-[40vh] flex-col items-center justify-center gap-2 text-center text-sm"
                >
                    <i class="pi pi-comments text-3xl"></i>
                    <p class="text-surface-300 m-0 font-semibold">No messages yet</p>
                    <p class="m-0 max-w-sm">Start the conversation with a message, photo, video, or audio clip.</p>
                </div>
            </div>

            <div
                v-if="chat.typingUsers.value.length"
                class="bg-surface-950/95 absolute inset-x-4 bottom-4 rounded-full px-4 py-2 text-xs shadow-[0_0_0_1px_rgba(255,255,255,0.04)]"
            >
                <span v-for="(user, index) in chat.typingUsers.value" :key="user.userId">
                    {{ user.username }}{{ index < chat.typingUsers.value.length - 1 ? ', ' : '' }}
                </span>
                <span class="text-surface-500">typing…</span>
            </div>
        </div>

        <Dialog
            v-model:visible="isEditDialogVisible"
            modal
            header="Edit message"
            :style="{ width: 'min(36rem, calc(100vw - 2rem))' }"
            :dismissableMask="true"
        >
            <div class="flex flex-col gap-3">
                <Textarea v-model="editingDraft" auto-resize rows="4" class="w-full rounded-2xl!" />
                <div class="flex justify-end gap-2">
                    <Button label="Cancel" severity="secondary" text @click="closeEditDialog" />
                    <Button label="Save" icon="pi pi-check" @click="saveEdit" />
                </div>
            </div>
        </Dialog>

        <Menu ref="menu" :model="menuItems" :popup="true" />
        <ContextMenu ref="contextMenu" :model="menuItems" />

        <Popover
            ref="op"
            :pt="{
                root: {
                    class: 'rounded-2xl! border-zinc-800! bg-zinc-950! shadow-2xl! overflow-hidden!',
                    style: {
                        '--p-popover-background': '#09090b',
                        '--p-popover-border-color': '#27272a'
                    }
                },
                content: {
                    class: 'p-0!'
                }
            }"
        >
            <div class="flex max-h-[450px] flex-col overflow-hidden">
                <div class="bg-zinc-900/50 px-3 pt-3 pb-1.5">
                    <h5 class="custom-emoji-header m-0 p-0">Quick Reactions</h5>
                </div>
                <div class="flex flex-wrap gap-1 border-b border-zinc-800 bg-zinc-900/50 px-2 pb-2">
                    <button
                        v-for="emoji in emojiChoices"
                        :key="emoji"
                        class="flex h-9 w-9 items-center justify-center rounded-xl text-lg transition hover:bg-white/10 active:scale-90"
                        title="Quick reaction"
                        @click="
                            onPickEmoji(activeReactionMessageId!, emoji);
                            op.hide();
                        "
                    >
                        <span class="font-emoji">{{ emoji }}</span>
                    </button>
                </div>
                <div class="emoji-picker-container p-0">
                    <EmojiPicker :native="true" theme="dark" :hide-group-names="false" @select="onEmojiSelect" />
                </div>
            </div>
        </Popover>
    </div>
</template>

<style scoped>
/* Arrow Border */
:deep(.p-popover:before) {
    border-color: #27272a !important; /* zinc-800 */
}

/* Emoji Picker Customization */
:deep(.v3-emoji-picker) {
    --v3-bg: #09090b !important;
    --v3-border-color: transparent !important;
    --v3-text-color: #f4f4f5 !important;
    --v3-input-bg: #18181b !important;
    --v3-input-border-color: #27272a !important;
    --v3-input-text-color: #f4f4f5 !important;
    --v3-input-placeholder-color: #71717a !important;
    --v3-group-h-bg: #09090b !important;
    --v3-hover-bg: #27272a !important;
    width: 320px;
    height: 380px;
    border-radius: 0;
    box-shadow: none;
    font-family: inherit;
    background-color: #09090b !important;
}

:deep(.v3-header) {
    padding: 12px 12px 8px;
    border-bottom: 0;
    background-color: #09090b !important;
}

:deep(.v3-emoji-picker input) {
    border-radius: 12px !important;
    padding: 8px 12px !important;
    font-size: 0.875rem !important;
    border: 1px solid #27272a !important;
    background-color: #18181b !important;
    color: #f4f4f5 !important;
    transition: all 0.2s !important;
    width: 100% !important;
}

:deep(.v3-emoji-picker input:focus) {
    border-color: #3b82f6 !important;
    box-shadow: 0 0 0 1px #3b82f6 !important;
    outline: none !important;
}

:deep(.v3-body-inner) {
    padding: 0 12px !important;
    background-color: #09090b !important;
}

:deep(.v3-group-h),
:deep(.v3-emoji-picker .v3-group h5),
:deep(.custom-emoji-header) {
    font-size: 10px !important;
    font-weight: 700 !important;
    color: #71717a !important; /* zinc-500 */
    padding-top: 8px !important;
    padding-bottom: 8px !important;
    text-transform: uppercase !important;
    letter-spacing: 0.1em !important;
    background-color: #09090b !important;
    margin: 0 !important;
    border: none !important;
    line-height: 1 !important;
}

:deep(.custom-emoji-header) {
    background-color: transparent !important;
    padding-top: 0 !important;
    padding-bottom: 0 !important;
}

:deep(.v3-footer) {
    display: none;
}

/* Custom Scrollbar */
:deep(.v3-body-inner::-webkit-scrollbar) {
    width: 6px;
}

:deep(.v3-body-inner::-webkit-scrollbar-track) {
    background: transparent;
}

:deep(.v3-body-inner::-webkit-scrollbar-thumb) {
    background: #27272a;
    border-radius: 10px;
}

:deep(.v3-body-inner::-webkit-scrollbar-thumb:hover) {
    background: #3f3f46;
}
</style>
