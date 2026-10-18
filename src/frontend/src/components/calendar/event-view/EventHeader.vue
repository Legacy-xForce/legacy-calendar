<script setup lang="ts">
import { computed } from 'vue';
import type { Event } from '../../../types/Event';
import UserAvatar from '../../UserAvatar.vue';
import EventStatusPill from '../../EventStatusPill.vue';
import RsvpBadge from '../../RsvpBadge.vue';
import { useShareEvent } from '../../../composables/useShareEvent';
import { injectEventView } from '../../../composables/useEventView';
import { getUserEventRole } from '../../../utils/event';

const props = defineProps<{
    event: Event;
}>();

const emit = defineEmits<{
    (e: 'open-chat'): void;
    (e: 'open-audit-log'): void;
    (e: 'edit'): void;
}>();

const {
    isGuestMode,
    allEventHosts,
    hostedByText,
    isDeadlinePassed,
    isEnded,
    isHost,
    canAccessChat,
    canAccessAuditLog,
    currentUser
} = injectEventView();
const { shareEvent } = useShareEvent();

const role = computed(() => getUserEventRole(props.event, currentUser.value?.id));

const visibility = computed(() => {
    if (props.event.isOpen) return { label: 'Open', icon: 'pi pi-globe' };
    if (props.event.isPrivate) return { label: 'Private', icon: 'pi pi-lock' };
    return { label: 'Invite only', icon: 'pi pi-users' };
});

const actions = computed(() => {
    const list: { key: string; label: string; icon: string; run: () => void }[] = [];
    if (canAccessChat.value)
        list.push({ key: 'chat', label: 'Chat', icon: 'pi pi-comments', run: () => emit('open-chat') });
    // A shared event link needs an account, so it's no use to a guest
    if (!isGuestMode)
        list.push({ key: 'share', label: 'Share', icon: 'pi pi-share-alt', run: () => shareEvent(props.event.id) });
    if (canAccessAuditLog.value) {
        list.push({ key: 'log', label: 'Activity', icon: 'pi pi-history', run: () => emit('open-audit-log') });
    }
    if (isHost.value && !isEnded.value)
        list.push({ key: 'edit', label: 'Edit', icon: 'pi pi-pencil', run: () => emit('edit') });
    return list;
});
</script>

<template>
    <div class="flex flex-col gap-5">
        <div class="flex flex-col gap-3">
            <div class="flex flex-wrap items-center gap-1.5">
                <EventStatusPill :event="event" />
                <RsvpBadge :role="role" />
                <span
                    class="bg-surface-850 text-muted inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[0.75rem] font-medium"
                >
                    <i :class="visibility.icon" class="text-[0.625rem]"></i>
                    {{ visibility.label }}
                </span>
                <span
                    v-if="isDeadlinePassed && !isEnded"
                    class="inline-flex h-6 items-center gap-1.5 rounded-full bg-amber-300/12 px-2.5 text-[0.75rem] font-medium text-amber-200"
                >
                    <i class="pi pi-clock text-[0.625rem]"></i>
                    Replies closed
                </span>
            </div>

            <h2 class="text-display md:text-display-lg text-fg m-0 break-words">{{ event.title }}</h2>

            <div v-if="allEventHosts.length > 0" class="flex items-center gap-2.5">
                <div class="flex items-center">
                    <UserAvatar
                        v-for="(host, index) in allEventHosts"
                        :key="host.id"
                        :profilePictureUrl="host.profilePictureUrl"
                        :username="host.username"
                        class="ring-raised size-7! text-[0.6875rem]! ring-2"
                        :class="index > 0 ? '-ml-1.5' : ''"
                    />
                </div>
                <span class="text-body text-muted min-w-0">
                    Hosted by <span class="text-fg font-medium">{{ hostedByText }}</span>
                </span>
            </div>
        </div>

        <div v-if="actions.length" class="grid auto-cols-fr grid-flow-col gap-2">
            <button
                v-for="action in actions"
                :key="action.key"
                type="button"
                class="pressable bg-surface-900 hover:bg-surface-850 text-fg flex min-w-0 flex-col items-center gap-1.5 rounded-2xl px-1 py-3"
                @click="action.run"
            >
                <i :class="action.icon" class="text-[1.0625rem]"></i>
                <span class="text-meta w-full truncate text-center font-medium">{{ action.label }}</span>
            </button>
        </div>
    </div>
</template>
