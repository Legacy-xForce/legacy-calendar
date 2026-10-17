<script setup lang="ts">
import { computed } from 'vue';
import { format } from 'date-fns';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import type { CalendarDay } from '../../types/Calendar';
import type { Event } from '../../types/Event';
import EventListItem from '../EventListItem.vue';

const props = defineProps<{
    visible: boolean;
    day: CalendarDay | null;
}>();

const emit = defineEmits<{
    (e: 'update:visible', value: boolean): void;
    (e: 'add-event', date: Date): void;
    (e: 'view-event', event: Event): void;
}>();

const close = () => emit('update:visible', false);

const sortedEvents = computed(() =>
    [...(props.day?.events ?? [])].sort((a, b) => a.startTime.localeCompare(b.startTime))
);

const handleAddEvent = () => {
    if (!props.day) return;
    emit('add-event', props.day.date);
    close();
};

const handleViewEvent = (event: Event) => {
    emit('view-event', event);
    close();
};
</script>

<template>
    <Dialog
        :visible="visible"
        @update:visible="emit('update:visible', $event)"
        modal
        dismissableMask
        :draggable="false"
        :style="{ width: '30rem' }"
    >
        <template #header>
            <div v-if="day" class="min-w-0">
                <h2 class="text-headline m-0">{{ format(day.date, 'EEEE') }}</h2>
                <p class="text-meta text-muted m-0">
                    {{ format(day.date, 'd MMMM yyyy') }} · {{ sortedEvents.length }}
                    {{ sortedEvents.length === 1 ? 'event' : 'events' }}
                </p>
            </div>
        </template>

        <div v-if="day" class="flex flex-col gap-2">
            <p v-if="sortedEvents.length === 0" class="text-body text-muted py-8 text-center">Nothing planned.</p>
            <EventListItem v-for="event in sortedEvents" :key="event.id" :event="event" @open="handleViewEvent" />
        </div>

        <template v-if="day && !day.isPast" #footer>
            <Button label="New event this day" icon="pi pi-plus" class="w-full" @click="handleAddEvent" />
        </template>
    </Dialog>
</template>
