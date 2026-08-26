<script setup lang="ts">
import type { Event } from '../../../types/Event';
import Tag from 'primevue/tag';
import UserAvatar from '../../UserAvatar.vue';
import { formatCurrency } from '../../../utils/format';
import Button from 'primevue/button';
import { useShareEvent } from '../../../composables/useShareEvent';
import { injectEventView } from '../../../composables/useEventView';

defineProps<{
    event: Event;
}>();

const { eventHost, coHosts, eventTotalBudget, isDeadlinePassed, canAccessChat, canAccessAuditLog } = injectEventView();
const { shareEvent } = useShareEvent();

const emit = defineEmits<{
    (e: 'open-chat'): void;
    (e: 'open-audit-log'): void;
}>();
</script>

<template>
    <div class="flex flex-col gap-3">
        <div class="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div class="flex flex-1 flex-col gap-1">
                <div class="flex items-start justify-between gap-2">
                    <h2 class="m-0 text-xl font-bold uppercase sm:text-2xl">{{ event.title }}</h2>
                    <div class="flex items-center gap-1">
                        <Button
                            rounded
                            severity="secondary"
                            text
                            v-tooltip.left="'Share Event'"
                            icon="pi pi-share-alt"
                            @click="shareEvent(event.id)"
                        />
                        <Button
                            v-if="canAccessChat"
                            rounded
                            text
                            v-tooltip.left="'Event Chat'"
                            icon="pi pi-comments"
                            @click="emit('open-chat')"
                        />
                        <Button
                            v-if="canAccessAuditLog"
                            rounded
                            text
                            v-tooltip.left="'Audit Log'"
                            icon="pi pi-list"
                            @click="emit('open-audit-log')"
                        />
                    </div>
                </div>
                <div class="flex flex-wrap items-center gap-2">
                    <Tag
                        v-if="event.isOpen"
                        severity="success"
                        value="Open Event"
                        icon="pi pi-globe"
                        class="text-[10px]!"
                    />
                    <Tag
                        v-else-if="event.isPrivate"
                        severity="danger"
                        value="Private Event"
                        icon="pi pi-lock"
                        class="text-[10px]!"
                    />
                    <Tag
                        v-else
                        severity="secondary"
                        value="Standard Event"
                        icon="pi pi-calendar"
                        class="text-[10px]!"
                    />
                    <Tag
                        v-if="isDeadlinePassed"
                        severity="warn"
                        value="Participation Closed"
                        icon="pi pi-lock"
                        class="border-orange-500/20 bg-orange-500/10 text-[10px]! text-orange-500"
                    />
                </div>
            </div>
            <div
                v-if="eventTotalBudget > 0"
                class="flex shrink-0 flex-row items-center justify-between gap-2 rounded-lg border border-emerald-500/10 bg-emerald-500/5 p-2 sm:flex-col sm:items-end sm:justify-start sm:gap-0 sm:rounded-none sm:border-none sm:bg-transparent sm:p-0"
            >
                <span class="text-[10px] font-bold tracking-wider text-zinc-500 uppercase sm:text-xs">
                    Total Expenses
                </span>
                <span class="display-text text-lg font-black text-emerald-500 sm:text-xl">
                    {{ formatCurrency(eventTotalBudget) }}
                </span>
            </div>
        </div>

        <div v-if="eventHost" class="flex items-center gap-2">
            <UserAvatar :profilePictureUrl="eventHost.profilePictureUrl" :username="eventHost.username" />
            <span class="text-surface-600 dark:text-surface-400">
                Hosted by
                <span class="text-surface-900 dark:text-surface-0 font-semibold">{{ eventHost.username }}</span>
            </span>
            <template v-if="coHosts.length > 0">
                <div
                    v-for="coHost in coHosts"
                    :key="coHost.id"
                    class="flex items-center gap-2"
                >
                    <span class="text-surface-600 dark:text-surface-400">Co-host:</span>
                    <UserAvatar :profilePictureUrl="coHost.profilePictureUrl" :username="coHost.username" />
                    <span class="text-surface-600 dark:text-surface-400">
                        <span class="text-surface-900 dark:text-surface-0 font-semibold">{{ coHost.username }}</span>
                    </span>
                </div>
            </template>
        </div>
    </div>
</template>
