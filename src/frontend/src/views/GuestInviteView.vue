<script setup lang="ts">
import { ref, computed, provide, defineAsyncComponent } from 'vue';
import { useRoute } from 'vue-router';
import { useToast } from 'primevue/usetoast';
import { useConfirm } from 'primevue/useconfirm';
import ProgressSpinner from 'primevue/progressspinner';
import InputText from 'primevue/inputtext';
import Button from 'primevue/button';
import Message from 'primevue/message';

import type { Event, EventFeature, TransportMode } from '../types/Event';
import api from '../services/API';
import { useEventView, EventViewInjectionKey } from '../composables/useEventView';
import { participantWantsFromSelection } from '../utils/event';
import EventViewMode from '../components/calendar/event-view/EventViewMode.vue';

const FeatureSelectionDialog = defineAsyncComponent(() => import('../components/calendar/FeatureSelectionDialog.vue'));

const route = useRoute();
const toast = useToast();
const confirm = useConfirm();

const token = computed(() => String(route.params.token ?? ''));

const loading = ref(true);
const notFound = ref(false);
const event = ref<Event | null>(null);
const guestUserId = ref<number | null>(null);
const isDeadlinePassed = ref(false);
const canEdit = ref(false);

const usernameInput = ref('');
const savingUsername = ref(false);
const showFeatureSelection = ref(false);
const leaving = ref(false);

const guestParticipant = computed(() => event.value?.participants?.find((p) => p.id === guestUserId.value));
const hasJoined = computed(() => guestParticipant.value?.status === 'ACCEPTED');

const currentUserRef = computed(() =>
    guestUserId.value
        ? { id: guestUserId.value, username: guestParticipant.value?.username || usernameInput.value, isAdmin: false }
        : null
);

const eventView = useEventView(event, { currentUser: currentUserRef, guestMode: true });
provide(EventViewInjectionKey, eventView);

const { eventPrices, eventSplitPrices, availableFeatureIds, isEnded, getParticipantFeatures } = eventView;

async function loadInvite() {
    loading.value = true;
    notFound.value = false;
    try {
        const response = await api.getGuestInvite(token.value);
        event.value = response.data.event;
        guestUserId.value = response.data.guestUserId;
        isDeadlinePassed.value = response.data.isDeadlinePassed;
        canEdit.value = response.data.canEdit;
        usernameInput.value = guestParticipant.value?.username || usernameInput.value;
    } catch {
        notFound.value = true;
    } finally {
        loading.value = false;
    }
}

void loadInvite();

const onOpenPreferences = () => {
    if (!usernameInput.value.trim()) {
        toast.add({ severity: 'warn', summary: 'Name required', detail: 'Please enter your name first', life: 4000 });
        return;
    }
    showFeatureSelection.value = true;
};

const handleFeatureConfirm = async (data: {
    features: EventFeature[];
    transport: { transportMode: TransportMode; vehicleSeats?: number };
}) => {
    showFeatureSelection.value = false;
    savingUsername.value = true;
    try {
        const response = await api.updateGuestInvite(token.value, {
            username: usernameInput.value.trim(),
            ...participantWantsFromSelection(data.features),
            transportMode: data.transport.transportMode,
            vehicleSeats: data.transport.vehicleSeats
        });
        event.value = response.data.event;
        isDeadlinePassed.value = response.data.isDeadlinePassed;
        canEdit.value = response.data.canEdit;
        toast.add({ severity: 'success', summary: 'Saved', detail: 'Your participation has been saved', life: 3000 });
    } catch (err: any) {
        toast.add({
            severity: 'error',
            summary: 'Error',
            detail: err.response?.data?.message || 'Failed to save your participation',
            life: 5000
        });
    } finally {
        savingUsername.value = false;
    }
};

const onLeave = () => {
    confirm.require({
        message: 'Are you sure you want to leave this event?',
        header: 'Confirm Leave',
        icon: 'pi pi-exclamation-triangle',
        rejectProps: { label: 'No', severity: 'secondary', text: true },
        acceptProps: { label: 'Yes, Leave', severity: 'danger' },
        accept: async () => {
            leaving.value = true;
            try {
                const response = await api.leaveGuestInvite(token.value);
                event.value = response.data.event;
                isDeadlinePassed.value = response.data.isDeadlinePassed;
                canEdit.value = response.data.canEdit;
                toast.add({ severity: 'success', summary: 'Left Event', detail: 'You left the event', life: 3000 });
            } catch (err: any) {
                toast.add({
                    severity: 'error',
                    summary: 'Error',
                    detail: err.response?.data?.message || 'Failed to leave the event',
                    life: 5000
                });
            } finally {
                leaving.value = false;
            }
        }
    });
};
</script>

<template>
    <div class="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 pb-24 sm:p-6">
        <div class="flex flex-col items-center gap-1 pt-4 text-center">
            <h1 class="m-0 text-xl font-bold uppercase sm:text-2xl">You're Invited</h1>
            <p class="text-surface-500 m-0 text-sm">Set your name and preferences below, no account needed.</p>
        </div>

        <div v-if="loading" class="flex justify-center py-16">
            <ProgressSpinner />
        </div>

        <Message v-else-if="notFound" severity="error" :closable="false">
            This invite link is invalid or no longer exists.
        </Message>

        <template v-else-if="event">
            <div class="flex flex-col gap-4 rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
                <div class="flex flex-col gap-2">
                    <label for="guest-username" class="text-sm font-bold tracking-wider text-zinc-500 uppercase">
                        Your Name
                    </label>
                    <InputText
                        id="guest-username"
                        v-model="usernameInput"
                        placeholder="Enter your name"
                        class="rounded-xl!"
                        :disabled="!canEdit"
                    />
                </div>

                <Message v-if="isDeadlinePassed" severity="warn" :closable="false">
                    The participation deadline has passed - you can still view the event, but can no longer edit your
                    participation.
                </Message>

                <div class="flex flex-wrap gap-2">
                    <Button
                        v-if="canEdit"
                        :label="hasJoined ? 'Edit My Preferences' : 'Set Preferences & Join'"
                        icon="pi pi-check"
                        severity="success"
                        :loading="savingUsername"
                        @click="onOpenPreferences"
                        class="rounded-xl!"
                    />
                    <Button
                        v-if="hasJoined && !isEnded"
                        label="Leave Event"
                        icon="pi pi-times"
                        severity="danger"
                        outlined
                        :loading="leaving"
                        @click="onLeave"
                        class="rounded-xl!"
                    />
                </div>
            </div>

            <EventViewMode :event="event" />
        </template>

        <FeatureSelectionDialog
            v-model:visible="showFeatureSelection"
            :availableFeatures="availableFeatureIds"
            :initialFeatures="guestUserId ? getParticipantFeatures(guestUserId) : []"
            :initialTransportMode="guestParticipant?.transportMode"
            :initialVehicleSeats="guestParticipant?.vehicleSeats"
            :submitLabel="hasJoined ? 'Save Changes' : 'Join Event'"
            :featurePrices="eventPrices"
            :featureSplitPrices="eventSplitPrices"
            @confirm="handleFeatureConfirm"
        />
    </div>
</template>
