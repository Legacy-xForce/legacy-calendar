<script setup lang="ts">
import { computed } from 'vue';
import { differenceInCalendarDays, differenceInMinutes } from 'date-fns';
import { useNow } from '../composables/useNow';
import type { Event } from '../types/Event';
import { getEventEnd } from '../utils/event';

const props = defineProps<{
    event: Event;
}>();

const { now } = useNow();

const startDate = computed(() => new Date(props.event.startTime));
const endDate = computed(() => getEventEnd(props.event));

const state = computed(() => {
    if (now.value > endDate.value) return 'ended';
    if (now.value >= startDate.value) return 'live';
    if (differenceInMinutes(startDate.value, now.value) <= 60) return 'soon';
    return 'upcoming';
});

const label = computed(() => {
    if (state.value === 'ended') return 'Ended';
    if (state.value === 'live') return 'Happening now';

    const minutes = differenceInMinutes(startDate.value, now.value);
    if (minutes < 1) return 'Starting now';
    if (minutes < 60) return `In ${minutes} min`;

    const hours = Math.floor(minutes / 60);
    const days = differenceInCalendarDays(startDate.value, now.value);
    if (days === 0) return `In ${hours} h`;
    if (days === 1) return 'Tomorrow';
    if (days < 7) return `In ${days} days`;
    const weeks = Math.round(days / 7);
    return weeks === 1 ? 'In 1 week' : `In ${weeks} weeks`;
});

const toneClass = computed(() => {
    switch (state.value) {
        case 'live':
            return 'bg-emerald-400/12 text-emerald-300';
        case 'soon':
            return 'bg-amber-300/12 text-amber-200';
        case 'ended':
            return 'bg-surface-900 text-subtle';
        default:
            return 'bg-surface-850 text-muted';
    }
});
</script>

<template>
    <span
        class="tabular inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[0.75rem] leading-none font-medium"
        :class="toneClass"
    >
        <span v-if="state === 'live'" class="relative flex size-1.5">
            <span class="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-60"></span>
            <span class="relative inline-flex size-1.5 rounded-full bg-current"></span>
        </span>
        {{ label }}
    </span>
</template>
