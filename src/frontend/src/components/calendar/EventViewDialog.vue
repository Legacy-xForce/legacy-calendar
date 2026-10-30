<script setup lang="ts">
import { computed, ref, watch, toRef, provide, defineAsyncComponent } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import Skeleton from 'primevue/skeleton';
import { format } from 'date-fns';
import { useToast } from 'primevue/usetoast';
import { useConfirm } from 'primevue/useconfirm';
import { useRoute, useRouter } from 'vue-router';

import type { Event, FeatureSelectionResult, ParticipateDto, RideDirection } from '../../types/Event';
import { useEventsStore } from '../../stores/events';
import EventViewMode from './event-view/EventViewMode.vue';
import { useEventView, EventViewInjectionKey } from '../../composables/useEventView';
import { createFeatureRecord, participantWantsFromSelection } from '../../utils/event';
import { normalizeHexColor } from '../../utils/color';
import { DEFAULT_COLOR } from '../../constants/colors';
import { parseEventId } from '../../utils/route';

const FeatureSelectionDialog = defineAsyncComponent(() => import('./FeatureSelectionDialog.vue'));

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
    availableFeatures,
    availableFeatureIds,
    getParticipantFeatures,
    getFeatureCount,
    eventPrices,
    eventSplitPrices
} = eventView;

// Others in for each feature (excluding you), so the join sheet can project your share
const otherFeatureCounts = computed(() => {
    const mine =
        userParticipantStatus.value === 'ACCEPTED' && currentUser.value
            ? getParticipantFeatures(currentUser.value.id)
            : [];
    return createFeatureRecord(
        availableFeatureIds.value,
        (feature) => getFeatureCount(feature) - (mine.includes(feature) ? 1 : 0)
    );
});

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
        header: isDecline ? 'Decline this invite?' : 'Leave this event?',
        message: isDecline
            ? "The host will see that you can't make it."
            : props.event?.isOpen
              ? 'The host will see that you can no longer make it.'
              : "It's invite only, so you might not be able to join again.",
        rejectProps: { label: 'Cancel', severity: 'secondary', text: true },
        acceptProps: { label: isDecline ? 'Decline' : 'Leave', severity: 'danger' },
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
                    summary: isDecline ? "Couldn't decline" : "Couldn't leave the event",
                    detail: eventsStore.error || 'Try again in a moment.',
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

const handleFeatureConfirm = async (data: FeatureSelectionResult) => {
    showFeatureSelection.value = false;
    if (!props.event || !currentUser.value) return;

    joining.value = true;
    try {
        const participateDto: ParticipateDto = {
            ...participantWantsFromSelection(data.features),
            transportMode: data.transport.transportMode,
            vehicleSeats: data.transport.vehicleSeats,
            vehicleSeatsOutbound: data.transport.vehicleSeatsOutbound,
            vehicleSeatsReturn: data.transport.vehicleSeatsReturn
        };

        const success = await eventsStore.joinEvent(props.event.id, participateDto);
        if (success) emit('joined');
        else throw new Error();
    } catch {
        toast.add({
            severity: 'error',
            summary: "Couldn't join",
            detail: eventsStore.error || 'Try again in a moment.',
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
            summary: "Couldn't assign the ride",
            detail: eventsStore.error || 'Try again in a moment.',
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
            summary: "Couldn't assign the rides",
            detail: eventsStore.error || 'Try again in a moment.',
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

const eventColor = computed(() => normalizeHexColor(props.event?.color, DEFAULT_COLOR));
const headerDate = computed(() => (props.event ? format(new Date(props.event.startTime), 'EEE d MMM · HH:mm') : ''));

watch(
    () => props.visible,
    (isVisible) => {
        if (!isVisible) {
            showFeatureSelection.value = false;
        }
    }
);
</script>

<template>
    <Dialog
        :visible="visible"
        @update:visible="emit('update:visible', $event)"
        modal
        :style="{ width: '44rem' }"
        dismissableMask
        :draggable="false"
        :pt="{ footer: { class: 'border-t! border-line! pt-3!' } }"
    >
        <template #header>
            <div v-if="event" class="text-meta text-muted tabular flex min-w-0 items-center gap-2">
                <span class="size-2.5 shrink-0 rounded-full" :style="{ background: eventColor }"></span>
                <span class="truncate">{{ headerDate }}</span>
            </div>
        </template>

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
        <div v-else class="flex flex-col gap-4 py-2" aria-busy="true">
            <Skeleton width="40%" height="1.5rem" border-radius="999px" />
            <Skeleton width="75%" height="2.25rem" />
            <Skeleton height="4.5rem" border-radius="1rem" />
            <Skeleton height="9rem" border-radius="1rem" />
        </div>

        <div
            v-if="navigationError"
            class="text-meta mt-3 rounded-xl border border-amber-300/25 bg-amber-300/10 px-3 py-2 text-amber-200"
        >
            {{ navigationError }}
        </div>

        <template #footer v-if="event && !isEnded && (userParticipantStatus || canAccept)">
            <div class="flex w-full gap-2">
                <template v-if="userParticipantStatus === 'ACCEPTED'">
                    <Button
                        label="Leave"
                        icon="pi pi-sign-out"
                        severity="danger"
                        text
                        :loading="cancelling"
                        @click="onCancelParticipation"
                    />
                    <Button
                        v-if="!isDeadlinePassed || isHost"
                        label="Change my choices"
                        icon="pi pi-sliders-h"
                        severity="secondary"
                        class="flex-1 sm:ml-auto sm:flex-none"
                        @click="onEditParticipation"
                    />
                </template>
                <template v-else>
                    <Button
                        v-if="userParticipantStatus === 'PENDING'"
                        label="Decline"
                        icon="pi pi-times"
                        severity="secondary"
                        class="flex-1 sm:flex-none"
                        :loading="cancelling"
                        @click="onDecline"
                    />
                    <Button
                        v-if="canAccept"
                        :label="isDeadlinePassed ? 'Replies closed' : 'Join'"
                        icon="pi pi-check"
                        class="flex-1 sm:ml-auto sm:flex-none sm:px-6"
                        :loading="joining"
                        :disabled="isDeadlinePassed || isEnded"
                        @click="onAcceptClick"
                    />
                </template>
            </div>
        </template>
    </Dialog>

    <FeatureSelectionDialog
        v-model:visible="showFeatureSelection"
        :availableFeatures="availableFeatures"
        :initialFeatures="currentUser ? getParticipantFeatures(currentUser.id) : []"
        :initialTransportMode="props.event?.participants?.find((p) => p.id === currentUser?.id)?.transportMode"
        :initialVehicleSeats="props.event?.participants?.find((p) => p.id === currentUser?.id)?.vehicleSeats"
        :initialVehicleSeatsOutbound="
            props.event?.participants?.find((p) => p.id === currentUser?.id)?.vehicleSeatsOutbound
        "
        :initialVehicleSeatsReturn="
            props.event?.participants?.find((p) => p.id === currentUser?.id)?.vehicleSeatsReturn
        "
        :submitLabel="userParticipantStatus === 'ACCEPTED' ? 'Save changes' : 'Join event'"
        :featurePrices="eventPrices"
        :featureSplitPrices="eventSplitPrices"
        :featureCounts="otherFeatureCounts"
        @confirm="handleFeatureConfirm"
    />
</template>
