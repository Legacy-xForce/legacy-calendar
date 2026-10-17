<script setup lang="ts">
import { computed } from 'vue';
import { format } from 'date-fns';
import type { CalendarDay } from '../../types/Calendar';
import type { Event } from '../../types/Event';
import EventCard from './EventCard.vue';

const props = defineProps<{
    day: CalendarDay;
    maxVisible: number;
    /** Phone-width columns: smaller type, and tapping a day opens its overview. */
    compact?: boolean;
}>();

const emit = defineEmits<{
    (e: 'add-event', date: Date): void;
    (e: 'view-event', event: Event): void;
    (e: 'zoom-day', day: CalendarDay): void;
}>();

const sortedEvents = computed(() => [...props.day.events].sort((a, b) => a.startTime.localeCompare(b.startTime)));

// When everything fits show it all; otherwise keep one row for the "+N more" link.
const visibleEvents = computed(() => {
    if (sortedEvents.value.length <= props.maxVisible) return sortedEvents.value;
    return sortedEvents.value.slice(0, Math.max(1, props.maxVisible - 1));
});
const hiddenCount = computed(() => sortedEvents.value.length - visibleEvents.value.length);

const handleClick = () => {
    if (props.compact && props.day.events.length > 0) {
        emit('zoom-day', props.day);
        return;
    }
    if (props.day.isPast) {
        if (props.day.events.length > 0) emit('zoom-day', props.day);
        return;
    }
    emit('add-event', props.day.date);
};
</script>

<template>
    <div
        class="cell group relative flex min-h-0 flex-col gap-0.5 overflow-hidden"
        :class="[
            compact ? 'p-0.5' : 'p-1.5',
            day.isCurrentMonth ? 'bg-canvas' : 'bg-surface-950',
            day.isPast && day.events.length === 0 ? 'cursor-default' : 'cursor-pointer'
        ]"
        :data-today="day.isToday || undefined"
        @click="handleClick"
    >
        <div class="flex shrink-0 items-center" :class="compact ? 'h-6 justify-center' : 'h-7 justify-between pl-0.5'">
            <span
                class="tabular flex items-center justify-center rounded-full font-medium"
                :class="[
                    compact ? 'size-5.5 text-[0.75rem]' : 'text-meta h-6 min-w-6 px-1.5',
                    day.isToday
                        ? 'bg-accent text-primary-contrast font-semibold'
                        : !day.isCurrentMonth
                          ? 'text-surface-700'
                          : day.isPast
                            ? 'text-subtle'
                            : 'text-fg'
                ]"
            >
                {{ day.date.getDate() === 1 && !compact ? format(day.date, 'd MMM') : day.date.getDate() }}
            </span>
            <button
                v-if="!day.isPast && !compact"
                type="button"
                class="text-muted hover:bg-surface-850 hover:text-fg flex size-6 items-center justify-center rounded-md opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-visible:opacity-100"
                :aria-label="`New event on ${format(day.date, 'EEEE d MMMM')}`"
                @click.stop="emit('add-event', day.date)"
            >
                <i class="pi pi-plus text-[0.6875rem]"></i>
            </button>
        </div>

        <div class="flex min-h-0 flex-col gap-0.5" :class="{ 'opacity-50': !day.isCurrentMonth }">
            <EventCard
                v-for="event in visibleEvents"
                :key="event.id"
                :event="event"
                :compact="compact"
                @click="emit('view-event', event)"
            />
            <button
                v-if="hiddenCount > 0"
                type="button"
                class="text-muted hover:text-fg hover:bg-surface-900 rounded-md text-left font-medium"
                :class="compact ? 'tabular h-4 px-1 text-[0.625rem]' : 'text-meta h-[1.375rem] px-1.5'"
                @click.stop="emit('zoom-day', day)"
            >
                {{ compact ? `+${hiddenCount}` : `${hiddenCount} more` }}
            </button>
        </div>
    </div>
</template>

<style scoped>
.cell {
    transition: background-color 160ms var(--ease-out-quart);
}

.cell.bg-canvas:hover {
    background-color: var(--color-surface-950);
}
</style>
