<script setup lang="ts">
import { computed } from 'vue';
import { format } from 'date-fns';
import type { Event } from '../../types/Event';
import { useSessionStore } from '../../stores/session';
import { getUserEventRole } from '../../utils/event';
import { normalizeHexColor } from '../../utils/color';
import { DEFAULT_COLOR } from '../../constants/colors';

const props = defineProps<{
    event: Event;
    /** Phone-width grid: title only, smaller, fading out instead of an ellipsis. */
    compact?: boolean;
}>();

const emit = defineEmits<{
    (e: 'click', event: Event): void;
}>();

const sessionStore = useSessionStore();
const color = computed(() => normalizeHexColor(props.event.color, DEFAULT_COLOR));
const role = computed(() => getUserEventRole(props.event, sessionStore.currentUser?.id));
</script>

<template>
    <button
        type="button"
        class="chip flex w-full min-w-0 shrink-0 items-center text-left font-medium"
        :class="[
            `chip-${role ?? 'none'}`,
            compact
                ? 'chip-compact h-[1.125rem] rounded-[0.3125rem] px-1 text-[0.6875rem]'
                : 'text-meta h-[1.375rem] gap-1.5 rounded-md px-1.5'
        ]"
        :style="{ '--event-color': color }"
        :title="`${format(new Date(event.startTime), 'HH:mm')} ${event.title}`"
        @click.stop="emit('click', event)"
    >
        <span v-if="!compact" class="tabular shrink-0 opacity-70 max-lg:hidden">{{
            format(new Date(event.startTime), 'HH:mm')
        }}</span>
        <span class="chip-title truncate">{{ event.title }}</span>
        <i v-if="event.isPrivate && !compact" class="pi pi-lock ml-auto shrink-0 text-[0.5625rem] opacity-60"></i>
    </button>
</template>

<style scoped>
.chip {
    color: color-mix(in oklab, var(--event-color) 30%, var(--color-fg));
    background: color-mix(in oklab, var(--event-color) 20%, transparent);
    box-shadow: inset 0 0 0 1px transparent;
    transition:
        background-color 140ms var(--ease-out-quart),
        transform 140ms var(--ease-out-quart);
}

.chip:hover {
    background: color-mix(in oklab, var(--event-color) 30%, transparent);
}

.chip:active {
    transform: scale(0.98);
}

/* Invited but not answered yet: outlined, like an unconfirmed booking */
.chip-invited {
    background: transparent;
    box-shadow: inset 0 0 0 1px color-mix(in oklab, var(--event-color) 70%, transparent);
}

.chip-invited:hover {
    background: color-mix(in oklab, var(--event-color) 12%, transparent);
}

.chip-compact .chip-title {
    text-overflow: clip;
    mask-image: linear-gradient(to right, #000 75%, transparent);
}

.chip-declined {
    background: transparent;
    color: var(--color-subtle);
    text-decoration: line-through;
}
</style>
