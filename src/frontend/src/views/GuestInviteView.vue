<script setup lang="ts">
import { ref, computed, provide, defineAsyncComponent } from 'vue';
import { useRoute } from 'vue-router';
import { useToast } from 'primevue/usetoast';
import { useConfirm } from 'primevue/useconfirm';
import Skeleton from 'primevue/skeleton';
import InputText from 'primevue/inputtext';
import Button from 'primevue/button';

import type { Event, FeatureSelectionResult } from '../types/Event';
import api from '../services/API';
import { useEventView, EventViewInjectionKey } from '../composables/useEventView';
import { participantWantsFromSelection } from '../utils/event';
import EventViewMode from '../components/calendar/event-view/EventViewMode.vue';
import AppLogo from '../components/AppLogo.vue';

const FeatureSelectionDialog = defineAsyncComponent(() => import('../components/calendar/FeatureSelectionDialog.vue'));

const PLACEHOLDER_GUEST_NAME = 'Guest';

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

const { eventPrices, eventSplitPrices, availableFeatures, isEnded, getParticipantFeatures } = eventView;

async function loadInvite() {
    loading.value = true;
    notFound.value = false;
    try {
        const response = await api.getGuestInvite(token.value);
        event.value = response.data.event;
        guestUserId.value = response.data.guestUserId;
        isDeadlinePassed.value = response.data.isDeadlinePassed;
        canEdit.value = response.data.canEdit;
        // New guests carry the placeholder name until they pick one, so start with an empty field
        const name = guestParticipant.value?.username;
        usernameInput.value = name && name !== PLACEHOLDER_GUEST_NAME ? name : usernameInput.value;
    } catch {
        notFound.value = true;
    } finally {
        loading.value = false;
    }
}

void loadInvite();

const nameInput = ref<{ $el: HTMLInputElement } | null>(null);
const nameMissing = ref(false);

const onOpenPreferences = () => {
    if (!usernameInput.value.trim()) {
        nameMissing.value = true;
        nameInput.value?.$el.focus();
        nameInput.value?.$el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
    }
    showFeatureSelection.value = true;
};

const handleFeatureConfirm = async (data: FeatureSelectionResult) => {
    showFeatureSelection.value = false;
    savingUsername.value = true;
    const wasJoined = hasJoined.value;
    try {
        const response = await api.updateGuestInvite(token.value, {
            username: usernameInput.value.trim(),
            ...participantWantsFromSelection(data.features),
            transportMode: data.transport.transportMode,
            vehicleSeats: data.transport.vehicleSeats,
            vehicleSeatsOutbound: data.transport.vehicleSeatsOutbound,
            vehicleSeatsReturn: data.transport.vehicleSeatsReturn
        });
        event.value = response.data.event;
        isDeadlinePassed.value = response.data.isDeadlinePassed;
        canEdit.value = response.data.canEdit;
        toast.add({ severity: 'success', summary: wasJoined ? 'Choices saved' : "You're in", life: 3000 });
    } catch (err: any) {
        toast.add({
            severity: 'error',
            summary: "Couldn't save your reply",
            detail: err.response?.data?.message || 'Try again in a moment.',
            life: 5000
        });
    } finally {
        savingUsername.value = false;
    }
};

const onLeave = () => {
    confirm.require({
        header: 'Leave this event?',
        message: 'The host will see that you can no longer make it.',
        rejectProps: { label: 'Stay', severity: 'secondary', text: true },
        acceptProps: { label: 'Leave', severity: 'danger' },
        accept: async () => {
            leaving.value = true;
            try {
                const response = await api.leaveGuestInvite(token.value);
                event.value = response.data.event;
                isDeadlinePassed.value = response.data.isDeadlinePassed;
                canEdit.value = response.data.canEdit;
                toast.add({ severity: 'success', summary: 'You left the event', life: 3000 });
            } catch (err: any) {
                toast.add({
                    severity: 'error',
                    summary: "Couldn't leave the event",
                    detail: err.response?.data?.message || 'Try again in a moment.',
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
    <div
        class="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-[calc(env(safe-area-inset-top)+1rem)] sm:px-6"
        :class="event && !notFound ? 'pb-[calc(6rem+env(safe-area-inset-bottom))]' : 'pb-10'"
    >
        <div class="text-fg flex items-center gap-2.5">
            <AppLogo class="size-6" />
            <span class="font-display text-title font-semibold tracking-tight">Legacy</span>
            <span class="text-meta text-subtle ml-auto">Guest invite</span>
        </div>

        <div v-if="loading" class="flex flex-col gap-4 pt-2" aria-busy="true">
            <Skeleton height="7.5rem" border-radius="1rem" />
            <Skeleton width="40%" height="1.5rem" border-radius="999px" />
            <Skeleton width="75%" height="2.25rem" />
            <Skeleton height="9rem" border-radius="1rem" />
        </div>

        <div v-else-if="notFound" class="animate-rise-in flex flex-col items-center gap-3 pt-[18dvh] text-center">
            <span class="bg-surface-900 text-muted flex size-14 items-center justify-center rounded-2xl">
                <i class="pi pi-link text-xl"></i>
            </span>
            <h1 class="text-headline m-0">This invite doesn't work anymore</h1>
            <p class="text-body text-muted m-0 max-w-xs">
                The link may be old, or the event was deleted. Ask whoever sent it for a new one.
            </p>
            <router-link to="/" class="text-meta text-muted hover:text-fg mt-2 font-medium">
                Have an account? Sign in
            </router-link>
        </div>

        <template v-else-if="event">
            <section class="border-line bg-raised animate-rise-in flex flex-col gap-4 rounded-2xl border p-4">
                <div>
                    <h1 class="text-headline m-0">{{ hasJoined ? "You're going" : "You're invited" }}</h1>
                    <p class="text-meta text-muted m-0 mt-0.5">
                        <template v-if="!canEdit">Replies are closed. You can still see the plan below.</template>
                        <template v-else-if="hasJoined">You can change your choices until replies close.</template>
                        <template v-else>Add your name, then pick what you're in for. No account needed.</template>
                    </p>
                </div>

                <div v-if="canEdit" class="flex flex-col gap-1.5">
                    <label for="guest-username" class="text-meta text-muted font-medium">Your name</label>
                    <InputText
                        id="guest-username"
                        ref="nameInput"
                        v-model="usernameInput"
                        autocomplete="name"
                        placeholder="How the group knows you"
                        :invalid="nameMissing && !usernameInput.trim()"
                        fluid
                        @update:modelValue="nameMissing = false"
                        @keydown.enter="onOpenPreferences"
                    />
                    <p
                        v-if="nameMissing && !usernameInput.trim()"
                        class="text-meta animate-rise-in m-0 text-rose-300"
                        role="alert"
                    >
                        Add your name so the host knows who's coming.
                    </p>
                </div>
            </section>

            <EventViewMode :event="event" />

            <div
                v-if="canEdit || (hasJoined && !isEnded)"
                class="border-line bg-canvas/90 fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur-md"
            >
                <div class="mx-auto flex w-full max-w-2xl gap-2 px-4 py-3 sm:px-6">
                    <Button
                        v-if="hasJoined && !isEnded"
                        label="Leave"
                        icon="pi pi-sign-out"
                        severity="danger"
                        text
                        :loading="leaving"
                        @click="onLeave"
                    />
                    <Button
                        v-if="canEdit"
                        :label="hasJoined ? 'Change my choices' : 'Join'"
                        :icon="hasJoined ? 'pi pi-sliders-h' : 'pi pi-check'"
                        :severity="hasJoined ? 'secondary' : undefined"
                        class="flex-1 sm:ml-auto sm:flex-none sm:px-6"
                        :loading="savingUsername"
                        @click="onOpenPreferences"
                    />
                </div>
            </div>
        </template>

        <FeatureSelectionDialog
            v-model:visible="showFeatureSelection"
            :availableFeatures="availableFeatures"
            :initialFeatures="guestUserId ? getParticipantFeatures(guestUserId) : []"
            :initialTransportMode="guestParticipant?.transportMode"
            :initialVehicleSeats="guestParticipant?.vehicleSeats"
            :initialVehicleSeatsOutbound="guestParticipant?.vehicleSeatsOutbound"
            :initialVehicleSeatsReturn="guestParticipant?.vehicleSeatsReturn"
            :submitLabel="hasJoined ? 'Save changes' : 'Join event'"
            :featurePrices="eventPrices"
            :featureSplitPrices="eventSplitPrices"
            @confirm="handleFeatureConfirm"
        />
    </div>
</template>
