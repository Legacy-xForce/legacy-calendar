<script setup lang="ts">
import { computed, ref, watch, toRef, provide, defineAsyncComponent } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import { useToast } from 'primevue/usetoast';
import { useConfirm } from 'primevue/useconfirm';
import { useRoute, useRouter } from 'vue-router';

import type { Event, EventFeature, RideDirection, TransportMode } from '../../types/Event';
import { useEventsStore } from '../../stores/events';
import EventViewMode from './event-view/EventViewMode.vue';
import { useEventView, EventViewInjectionKey } from '../../composables/useEventView';

const FeatureSelectionDialog = defineAsyncComponent(() => import('./FeatureSelectionDialog.vue'));
import type { ParticipateDto } from '../../types/Event';

const props = defineProps<{
    visible: boolean;
    event: Event | null;
    navigationError?: string | null;
}>();

const emit = defineEmits<{
    (e: 'update:visible', value: boolean): void;
    (e: 'delete', id: number): void;
    (e: 'joined'): void;
    (e: 'refresh'): void;
    (e: 'edit', event: Event): void;
    (e: 'open-audit-log'): void;
}>();

const eventsStore = useEventsStore();
const toast = useToast();
const confirm = useConfirm();
const route = useRoute();
const router = useRouter();

const eventView = useEventView(toRef(props, 'event'));
provide(EventViewInjectionKey, eventView);

const {
    canAccept,
    isHost,
    isDeadlinePassed,
    isEnded,
    userParticipantStatus,
    currentUser,
    dragOverDriverId,
    availableFeatureIds,
    getParticipantFeatures,
    eventPrices,
    eventSplitPrices
} = eventView;

const joining = ref(false);
const cancelling = ref(false);
const showFeatureSelection = ref(false);

const currentSection = computed(() =>
    route.name === 'upcoming' || route.path.startsWith('/upcoming/') ? 'upcoming' : 'calendar'
);
const currentEventPath = computed(() => {
    const eventId = props.event?.id ?? parseEventId(route.params.id);
    if (!eventId) return currentSection.value === 'upcoming' ? '/upcoming' : '/event';

    return `${currentSection.value === 'upcoming' ? '/upcoming' : '/event'}/${eventId}`;
});

const onAcceptClick = () => {
    showFeatureSelection.value = true;
};

const onEditParticipation = () => {
    if (!currentUser.value) return;
    if (isDeadlinePassed.value && !isHost.value) return;
    showFeatureSelection.value = true;
};

const onLeaveEvent = (isDecline = false) => {
    confirm.require({
        message: isDecline
            ? 'Are you sure you want to decline this invitation?'
            : 'Are you sure you want to leave this event? If the event is private/invite only, you might not be able to join again.',
        header: isDecline ? 'Confirm Decline' : 'Confirm Leave',
        icon: 'pi pi-exclamation-triangle',
        rejectProps: {
            label: 'No',
            severity: 'secondary',
            text: true
        },
        acceptProps: {
            label: isDecline ? 'Yes, Decline' : 'Yes, Leave',
            severity: 'danger'
        },
        accept: async () => {
            if (!props.event || !currentUser.value) return;

            cancelling.value = true;
            try {
                const success = await eventsStore.leaveEvent(props.event.id);
                if (success) emit('joined');
                else throw new Error();
            } catch {
                toast.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: eventsStore.error || `Failed to ${isDecline ? 'decline invitation' : 'leave event'}`,
                    life: 5000
                });
            } finally {
                cancelling.value = false;
            }
        }
    });
};

const onCancelParticipation = () => onLeaveEvent(false);
const onDecline = () => onLeaveEvent(true);

const handleFeatureConfirm = async (data: {
    features: EventFeature[];
    transport: { transportMode: TransportMode; vehicleSeats?: number };
}) => {
    showFeatureSelection.value = false;
    if (!props.event || !currentUser.value) return;

    joining.value = true;
    try {
        const participateDto: ParticipateDto = {
            ...participantWantsFromSelection(data.features),
            transportMode: data.transport.transportMode,
            vehicleSeats: data.transport.vehicleSeats
        };

        const success = await eventsStore.joinEvent(props.event.id, participateDto);
        if (success) emit('joined');
        else throw new Error();
    } catch {
        toast.add({
            severity: 'error',
            summary: 'Error',
            detail: eventsStore.error || 'Failed to join event',
            life: 5000
        });
    } finally {
        joining.value = false;
    }
};

const onDragStart = (event: DragEvent, passengerId: number, direction: RideDirection) => {
    if (!event.dataTransfer) return;
    event.dataTransfer.setData('passengerId', passengerId.toString());
    event.dataTransfer.setData('direction', direction);
    event.dataTransfer.effectAllowed = 'move';
};

const onDragOver = (event: DragEvent, driverId: number) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    dragOverDriverId.value = driverId;
};

const onDragLeave = () => {
    dragOverDriverId.value = null;
};

const assignRide = async (passengerId: number, driverId: number | null, direction: RideDirection = 'OUTBOUND') => {
    if (!props.event) return;

    try {
        const success = await eventsStore.assignRide(props.event.id, passengerId, driverId, direction);
        if (success) emit('refresh');
        else throw new Error();
    } catch {
        toast.add({
            severity: 'error',
            summary: 'Error',
            detail: eventsStore.error || 'Failed to assign ride',
            life: 5000
        });
    }
};

const assignRidesBatch = async (
    passengerIds: number[],
    driverId: number | null,
    direction: RideDirection = 'OUTBOUND'
) => {
    if (!props.event) return;

    try {
        const success = await eventsStore.assignRidesBatch(props.event.id, passengerIds, driverId, direction);
        if (success) emit('refresh');
        else throw new Error();
    } catch {
        toast.add({
            severity: 'error',
            summary: 'Error',
            detail: eventsStore.error || 'Failed to assign rides',
            life: 5000
        });
    }
};

const onDrop = async (event: DragEvent, driverId: number, direction: RideDirection) => {
    event.preventDefault();
    dragOverDriverId.value = null;

    if (!event.dataTransfer) return;

    const passengerId = Number.parseInt(event.dataTransfer.getData('passengerId'), 10);
    if (Number.isNaN(passengerId)) return;

    await assignRide(passengerId, driverId, direction);
};

const onDelete = () => {
    if (props.event) {
        emit('delete', props.event.id);
    }
};

const onEdit = () => {
    if (props.event) {
        emit('edit', props.event);
    }
};

const onOpenChat = () => {
    if (!props.event) return;

    void router.push({ path: `${currentEventPath.value}/chat` });
};

import { participantWantsFromSelection } from '../../utils/event';

watch(
    () => props.visible,
    (isVisible) => {
        if (!isVisible) {
            showFeatureSelection.value = false;
        }
    }
);

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
        :visible="visible"
        @update:visible="emit('update:visible', $event)"
        modal
        header="Event Details"
        :style="{ width: '1000px' }"
        :breakpoints="{ '960px': '85vw', '640px': '95vw' }"
        class="p-fluid"
        dismissableMask
        :draggable="false"
    >
        <EventViewMode
            v-if="event"
            :event="event"
            @edit="onEdit"
            @delete="onDelete"
            @drag-start="onDragStart"
            @drag-over="onDragOver"
            @drag-leave="onDragLeave"
            @drop="onDrop"
            @assign-ride="assignRide"
            @assign-rides-batch="assignRidesBatch"
            @open-chat="onOpenChat"
            @open-audit-log="emit('open-audit-log')"
        />

        <div
            v-if="navigationError"
            class="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200"
        >
            {{ navigationError }}
        </div>

        <template #footer v-if="!isEnded">
            <div class="flex w-full justify-between gap-2 pt-4">
                <div class="hidden gap-2 md:flex">
                    <template v-if="isHost">
                        <Button
                            label="Edit"
                            icon="pi pi-pencil"
                            severity="secondary"
                            text
                            @click="onEdit"
                            class="rounded-xl!"
                        />
                        <Button
                            label="Delete"
                            icon="pi pi-trash"
                            severity="danger"
                            text
                            @click="onDelete"
                            class="rounded-xl!"
                        />
                    </template>
                </div>

                <div class="flex flex-1 justify-end gap-2 md:flex-initial">
                    <template v-if="userParticipantStatus === 'ACCEPTED'">
                        <Button
                            label="Leave"
                            icon="pi pi-times"
                            severity="danger"
                            text
                            :loading="cancelling"
                            @click="onCancelParticipation"
                            class="rounded-xl!"
                        />
                        <Button
                            v-if="!isDeadlinePassed || isHost"
                            label="Edit Participation"
                            icon="pi pi-pencil"
                            severity="secondary"
                            @click="onEditParticipation"
                            class="rounded-xl!"
                        />
                    </template>
                    <template v-else>
                        <Button
                            v-if="userParticipantStatus === 'PENDING'"
                            label="Decline"
                            icon="pi pi-times"
                            severity="danger"
                            text
                            :loading="cancelling"
                            :disabled="isEnded"
                            @click="onDecline"
                            class="rounded-xl!"
                        />
                        <Button
                            v-if="canAccept"
                            :label="userParticipantStatus === 'ACCEPTED' ? 'Joined' : 'Join'"
                            icon="pi pi-check"
                            severity="success"
                            :loading="joining"
                            :disabled="userParticipantStatus === 'ACCEPTED' || isDeadlinePassed || isEnded"
                            @click="onAcceptClick"
                            class="rounded-xl!"
                        />
                    </template>
                </div>
            </div>
        </template>
    </Dialog>

    <FeatureSelectionDialog
        v-model:visible="showFeatureSelection"
        :availableFeatures="availableFeatureIds"
        :initialFeatures="currentUser ? getParticipantFeatures(currentUser.id) : []"
        :initialTransportMode="props.event?.participants?.find((p) => p.id === currentUser?.id)?.transportMode"
        :initialVehicleSeats="props.event?.participants?.find((p) => p.id === currentUser?.id)?.vehicleSeats"
        :initialVehicleSeatsOutbound="
            props.event?.participants?.find((p) => p.id === currentUser?.id)?.vehicleSeatsOutbound
        "
        :initialVehicleSeatsReturn="
            props.event?.participants?.find((p) => p.id === currentUser?.id)?.vehicleSeatsReturn
        "
        :submitLabel="userParticipantStatus === 'ACCEPTED' ? 'Save Changes' : 'Join Event'"
        :featurePrices="eventPrices"
        :featureSplitPrices="eventSplitPrices"
        @confirm="handleFeatureConfirm"
    />
</template>
