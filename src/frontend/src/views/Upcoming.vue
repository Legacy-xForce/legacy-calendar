<script setup lang="ts">
import { onMounted, ref, computed, defineAsyncComponent } from 'vue';
import { storeToRefs } from 'pinia';
import ProgressSpinner from 'primevue/progressspinner';
import UpcomingEventCard from '../components/UpcomingEventCard.vue';
import UpcomingHeroCard from '../components/UpcomingHeroCard.vue';
import type { Event } from '../types/Event';
import Button from 'primevue/button';

import { useEventsStore } from '../stores/events';
import { useEventWeather } from '../composables/useEventWeather';

const EventViewDialog = defineAsyncComponent(() => import('../components/calendar/EventViewDialog.vue'));
const EventChatDialog = defineAsyncComponent(() => import('../components/calendar/event-view/EventChatDialog.vue'));
const EventAuditLogDialog = defineAsyncComponent(
    () => import('../components/calendar/event-view/EventAuditLogDialog.vue')
);
const EventEditDialog = defineAsyncComponent(() => import('../components/calendar/EventEditDialog.vue'));

const eventsStore = useEventsStore();

const { upcomingEvents: events, loading, error } = storeToRefs(eventsStore);

const { loadWeatherForEvents: refreshWeather } = useEventWeather(events);

onMounted(async () => {
    await eventsStore.fetchUpcomingEvents();
    refreshWeather();
});

import { useEventDialogs } from '../composables/useEventDialogs';

const heroEvent = computed(() => (events.value.length > 0 ? events.value[0] : null));
const otherEvents = computed(() => (events.value.length > 1 ? events.value.slice(1) : []));

// We need to look in both the events list and a potentially separately fetched shared event
const sharedEvent = ref<Event | null>(null);

const {
    showViewDialog,
    showEditDialog,
    showChatDialog,
    showAuditLogDialog,
    eventToEdit,
    selectedEvent,
    openViewEvent: baseOpenViewEvent,
    openAuditLogEvent,
    handleEditEvent,
    handleDeleteEvent
} = useEventDialogs(events, sharedEvent);

const openViewEvent = (event: Event) => {
    // If the event is not in the list, store it separately so selectedEvent computed works
    if (!events.value.find((e) => e.id === event.id)) {
        sharedEvent.value = event;
    }
    baseOpenViewEvent(event);
};
</script>

<template>
    <div class="flex w-full flex-col gap-6 p-4 pb-20 lg:p-8 lg:pt-2 lg:pb-6">
        <!-- Header -->
        <div class="flex flex-row items-end justify-between gap-2">
            <div>
                <h1
                    class="text-surface-900 dark:text-surface-0 text-2xl font-black tracking-tight sm:text-3xl md:text-4xl"
                >
                    Upcoming
                </h1>
                <p class="text-surface-400 mt-1 text-sm font-medium">Your schedule for the near future.</p>
            </div>
        </div>

        <div v-if="loading" class="flex min-h-[400px] flex-1 items-center justify-center">
            <ProgressSpinner />
        </div>

        <div v-else-if="error" class="flex min-h-[400px] flex-1 flex-col items-center justify-center text-center">
            <div class="mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-red-500/10 text-red-500">
                <i class="pi pi-exclamation-triangle text-3xl"></i>
            </div>
            <h3 class="text-surface-0 text-xl font-bold">Something went wrong</h3>
            <p class="text-surface-400 mt-2 max-w-xs text-sm">{{ error }}</p>
            <Button
                label="Reload Events"
                icon="pi pi-refresh"
                class="mt-6 rounded-xl!"
                @click="eventsStore.fetchUpcomingEvents"
            />
        </div>

        <div
            v-else-if="events.length === 0"
            class="flex min-h-[500px] flex-1 flex-col items-center justify-center p-6 text-center"
        >
            <div class="relative mb-8">
                <div class="bg-primary-500/10 absolute inset-0 animate-pulse rounded-full blur-3xl"></div>
                <div
                    class="bg-surface-900/50 relative flex h-24 w-24 items-center justify-center rounded-3xl border border-white/5 backdrop-blur-sm"
                >
                    <i class="pi pi-calendar-plus text-surface-400 text-4xl"></i>
                </div>
            </div>
            <h3 class="text-surface-0 text-2xl font-bold">Quiet days ahead</h3>
            <p class="text-surface-400 mt-3 max-w-sm text-base leading-relaxed">
                You're all caught up! No upcoming events found. Why not plan something new?
            </p>
            <router-link :to="{ name: 'calendar' }" class="mt-8">
                <Button label="Schedule an Event" icon="pi pi-plus" class="rounded-xl! px-8! py-3!" />
            </router-link>
        </div>

        <div v-else class="flex flex-col gap-8">
            <!-- Hero Section -->
            <section v-if="heroEvent" class="hero-section">
                <h3 class="text-surface-400 mb-4 text-xs font-bold tracking-widest uppercase">Next Up</h3>
                <div class="flex flex-col gap-3">
                    <UpcomingHeroCard :event="heroEvent" @view="openViewEvent" />
                </div>
            </section>

            <!-- Grid Section -->
            <section v-if="otherEvents.length > 0" class="other-events-section">
                <h3 class="text-surface-400 mb-4 text-xs font-bold tracking-widest uppercase">Coming Later</h3>
                <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    <div v-for="event in otherEvents" :key="event.id" class="flex flex-col gap-3">
                        <UpcomingEventCard :event="event" class="fade-in" @view="openViewEvent" />
                    </div>
                </div>
            </section>
        </div>

        <!-- Event View Dialog -->
        <EventViewDialog
            v-model:visible="showViewDialog"
            :event="selectedEvent"
            @delete="handleDeleteEvent"
            @edit="handleEditEvent"
            @open-audit-log="selectedEvent && openAuditLogEvent(selectedEvent)"
        />

        <EventChatDialog v-model:visible="showChatDialog" :event="selectedEvent" />

        <EventAuditLogDialog v-model:visible="showAuditLogDialog" :event="selectedEvent" />

        <!-- Event Edit Dialog -->
        <EventEditDialog
            v-model:visible="showEditDialog"
            :event="eventToEdit"
            @saved="eventsStore.fetchUpcomingEvents"
            @deleted="handleDeleteEvent"
        />
    </div>
</template>

<style scoped>
.fade-in {
    animation: fadeIn 0.4s ease-out;
}

@keyframes fadeIn {
    from {
        opacity: 0;
        transform: translateY(10px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}
</style>
