<script setup lang="ts">
import type { Event, RideDirection } from '../../../types/Event';
import { injectEventView } from '../../../composables/useEventView';

import EventHeader from './EventHeader.vue';
import EventInfo from './EventInfo.vue';
import EventCostBreakdown from './EventCostBreakdown.vue';
import EventParticipantsTable from './EventParticipantsTable.vue';
import EventTransportSection from './EventTransportSection.vue';
import EventActions from './EventActions.vue';

defineProps<{
    event: Event;
}>();

const emit = defineEmits<{
    (e: 'edit', event: Event): void;
    (e: 'delete'): void;
    (e: 'drag-start', event: DragEvent, passengerId: number, direction: RideDirection): void;
    (e: 'drag-over', event: DragEvent, driverId: number): void;
    (e: 'drag-leave'): void;
    (e: 'drop', event: DragEvent, driverId: number, direction: RideDirection): void;
    (e: 'assign-ride', passengerId: number, driverId: number | null, direction: RideDirection): void;
    (e: 'assign-rides-batch', passengerIds: number[], driverId: number | null, direction: RideDirection): void;
    (e: 'open-chat'): void;
    (e: 'open-audit-log'): void;
}>();

const { isHost, isEnded, availableFeatureIds } = injectEventView();
</script>

<template>
    <div class="flex flex-col gap-7 pt-1">
        <EventHeader
            :event="event"
            @open-chat="emit('open-chat')"
            @open-audit-log="emit('open-audit-log')"
            @edit="emit('edit', event)"
        />

        <EventInfo :event="event" @open-chat="emit('open-chat')" />

        <EventCostBreakdown v-if="availableFeatureIds.length > 0" :event="event" />

        <EventParticipantsTable :event="event" />

        <EventTransportSection
            :event="event"
            @drag-start="(ev, pid, direction) => emit('drag-start', ev, pid, direction)"
            @drag-over="(ev, did) => emit('drag-over', ev, did)"
            @drag-leave="emit('drag-leave')"
            @drop="(ev, did, direction) => emit('drop', ev, did, direction)"
            @assign-ride="(pid, did, direction) => emit('assign-ride', pid, did, direction)"
            @assign-rides-batch="(pids, did, direction) => emit('assign-rides-batch', pids, did, direction)"
        />

        <EventActions v-if="isHost && !isEnded" @delete="emit('delete')" />
    </div>
</template>
