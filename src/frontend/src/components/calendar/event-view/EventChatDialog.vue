<script setup lang="ts">
import { computed, toRef } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import Textarea from 'primevue/textarea';
import { useRoute, useRouter } from 'vue-router';
import type { Event } from '../../../types/Event';
import EventChatPanel from '../../chat/EventChatPanel.vue';
import { useEventChatDialogState } from './chat/useEventChatDialogState';
import { useMediaQuery, MOBILE_QUERY } from '../../../composables/useMediaQuery';

const props = defineProps<{
    visible: boolean;
    event: Event | null;
}>();

const emit = defineEmits<{
    (e: 'update:visible', value: boolean): void;
}>();

const route = useRoute();
const router = useRouter();
const isMobile = useMediaQuery(MOBILE_QUERY);

const currentSection = computed(() =>
    route.name === 'upcoming' || route.path.startsWith('/upcoming/') ? 'upcoming' : 'calendar'
);
const currentEventPath = computed(() => {
    const eventId = props.event?.id ?? parseEventId(route.params.id);
    if (!eventId) return currentSection.value === 'upcoming' ? '/upcoming' : '/event';

    return `${currentSection.value === 'upcoming' ? '/upcoming' : '/event'}/${eventId}`;
});

const closeChat = () => {
    if (!props.event) {
        void router.back();
        return;
    }

    void router.replace({ path: currentEventPath.value });
};

const chatState = useEventChatDialogState(toRef(props, 'event'), closeChat, toRef(props, 'visible'));
const {
    title,
    chat,
    isChatMuted,
    muteStateLoading,
    draftText,
    selectedFile,
    selectedFilePreviewUrl,
    previewFileLabel,
    previewFileType,
    fileInput,
    setDraftText,
    chooseFile,
    triggerFilePicker,
    clearSelectedFile,
    emitTyping,
    sendCurrentMessage,
    handleMuteToggle
} = chatState;

// Template refs and helpers are used from the template only
void fileInput;

const showDialog = computed({
    get: () => props.visible,
    set: (value) => emit('update:visible', value)
});

const status = computed(() => {
    const count = chat.messages.value.length;
    const messages = `${count} ${count === 1 ? 'message' : 'messages'}`;
    return chat.connected.value ? messages : `Connecting… · ${messages}`;
});

const canSend = computed(() => !!draftText.value.trim() || !!selectedFile.value);

function parseEventId(value: unknown) {
    if (Array.isArray(value)) {
        return parseEventId(value[0]);
    }

    if (typeof value !== 'string' || value.length === 0) {
        return null;
    }

    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
}
</script>

<template>
    <Dialog
        v-model:visible="showDialog"
        modal
        dismissableMask
        :class="isMobile ? 'p-dialog-maximized' : ''"
        :style="isMobile ? undefined : { width: '44rem' }"
        :draggable="false"
        :pt="{
            root: { class: isMobile ? 'rounded-none! border-none!' : '' },
            header: { class: 'border-b border-line py-3!' },
            content: { class: `p-0! flex flex-col ${isMobile ? '' : 'h-[min(80vh,52rem)]'}` },
            footer: { class: 'border-t border-line p-2.5! pb-[max(0.625rem,env(safe-area-inset-bottom))]!' }
        }"
    >
        <template #header>
            <div class="flex min-w-0 flex-1 items-center gap-3">
                <div class="min-w-0 flex-1">
                    <h2 class="text-title m-0 truncate">{{ title }}</h2>
                    <p class="text-meta text-muted m-0 flex items-center gap-1.5">
                        <span
                            class="size-1.5 rounded-full"
                            :class="chat.connected.value ? 'bg-emerald-400' : 'bg-surface-600'"
                        ></span>
                        {{ status }}
                    </p>
                </div>
                <Button
                    v-if="chatState.canAccessChat.value"
                    :icon="isChatMuted ? 'pi pi-bell-slash' : 'pi pi-bell'"
                    text
                    rounded
                    severity="secondary"
                    :loading="muteStateLoading"
                    :aria-label="isChatMuted ? 'Unmute notifications' : 'Mute notifications'"
                    v-tooltip.bottom="isChatMuted ? 'Notifications muted' : 'Mute notifications'"
                    @click="() => handleMuteToggle(!isChatMuted)"
                />
            </div>
        </template>

        <div v-if="event" class="flex min-h-0 flex-1 flex-col overflow-hidden">
            <EventChatPanel v-if="chatState.canAccessChat.value" />
            <div v-else class="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
                <i class="pi pi-lock text-subtle text-2xl"></i>
                <h3 class="text-headline m-0">Only for people going</h3>
                <p class="text-body text-muted m-0 max-w-sm">Join the event to read and write in its chat.</p>
                <Button
                    label="Back to event"
                    icon="pi pi-arrow-left"
                    severity="secondary"
                    class="mt-2"
                    @click="closeChat"
                />
            </div>
        </div>

        <div v-else class="flex h-[60vh] items-center justify-center">
            <i class="pi pi-spin pi-spinner text-subtle text-xl"></i>
        </div>

        <template v-if="chatState.canAccessChat.value" #footer>
            <div class="flex w-full flex-col gap-2">
                <div
                    v-if="selectedFile"
                    class="border-line bg-raised animate-rise-in flex items-center gap-3 rounded-2xl border p-2"
                >
                    <img
                        v-if="selectedFilePreviewUrl"
                        :src="selectedFilePreviewUrl"
                        alt=""
                        class="size-12 shrink-0 rounded-xl object-cover"
                    />
                    <span v-else class="bg-surface-900 flex size-12 shrink-0 items-center justify-center rounded-xl">
                        <i class="pi pi-file text-muted"></i>
                    </span>
                    <div class="min-w-0 flex-1">
                        <p class="text-meta text-fg m-0 truncate font-medium">{{ previewFileLabel }}</p>
                        <p class="text-meta text-subtle m-0">{{ previewFileType || 'Attachment' }}</p>
                    </div>
                    <Button
                        icon="pi pi-times"
                        text
                        rounded
                        severity="secondary"
                        aria-label="Remove attachment"
                        @click="clearSelectedFile"
                    />
                </div>

                <div class="flex items-end gap-1.5">
                    <input
                        ref="fileInput"
                        id="chat-upload"
                        type="file"
                        class="hidden"
                        accept="image/*,video/*,audio/*"
                        @change="chooseFile"
                    />
                    <Button
                        icon="pi pi-paperclip"
                        text
                        rounded
                        severity="secondary"
                        aria-label="Attach a photo, video or audio"
                        class="shrink-0"
                        @click="triggerFilePicker"
                    />
                    <Textarea
                        :modelValue="draftText"
                        auto-resize
                        rows="1"
                        placeholder="Message"
                        aria-label="Message"
                        class="max-h-32 min-h-10.5 flex-1 rounded-[1.375rem]! px-4! py-2.5!"
                        enterkeyhint="send"
                        @update:modelValue="setDraftText"
                        @input="emitTyping"
                        @blur="chat.stopTyping()"
                        @keydown.enter.exact.prevent="sendCurrentMessage"
                    />
                    <button
                        type="button"
                        class="pressable flex size-10.5 shrink-0 items-center justify-center rounded-full transition-colors"
                        :class="canSend ? 'bg-accent text-primary-contrast' : 'bg-surface-850 text-subtle'"
                        :disabled="!canSend || chat.sending.value"
                        aria-label="Send"
                        @click="sendCurrentMessage"
                    >
                        <i :class="chat.sending.value ? 'pi pi-spin pi-spinner' : 'pi pi-arrow-up'" class="text-sm"></i>
                    </button>
                </div>
            </div>
        </template>
    </Dialog>
</template>
