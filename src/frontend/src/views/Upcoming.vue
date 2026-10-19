<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { storeToRefs } from 'pinia';
import { format, startOfDay } from 'date-fns';
import Button from 'primevue/button';
import Skeleton from 'primevue/skeleton';
import EventListItem from '../components/EventListItem.vue';
import UpcomingHeroCard from '../components/UpcomingHeroCard.vue';
import type { Event } from '../types/Event';
import { useEventsStore } from '../stores/events';
import { useSessionStore } from '../stores/session';
import { useEventWeather } from '../composables/useEventWeather';
import { useEventDialogs, createEventViewDialogs } from '../composables/useEventDialogs';
import { getUserEventRole } from '../utils/event';
import { dayLabel } from '../utils/format';

const { EventViewDialog, EventChatDialog, EventAuditLogDialog, EventEditDialog } = createEventViewDialogs();

const eventsStore = useEventsStore();
const sessionStore = useSessionStore();

const { upcomingEvents: events, loading, error } = storeToRefs(eventsStore);

const { loadWeatherForEvents: refreshWeather } = useEventWeather(events);

onMounted(async () => {
    await eventsStore.fetchUpcomingEvents();
    refreshWeather();
});

const heroEvent = computed(() => (events.value.length > 0 ? events.value[0] : null));
const otherEvents = computed(() => (events.value.length > 1 ? events.value.slice(1) : []));

const invitedCount = computed(
    () => events.value.filter((event) => getUserEventRole(event, sessionStore.currentUser?.id) === 'invited').length
);

const groups = computed(() => {
    const result: { key: string; label: string; date: string; events: Event[] }[] = [];
    for (const event of otherEvents.value) {
        const day = startOfDay(new Date(event.startTime));
        const key = day.toISOString();
        let group = result.find((item) => item.key === key);
        if (!group) {
            const label = dayLabel(day);
            group = { key, label, date: label.includes(' ') ? '' : format(day, 'd MMM'), events: [] };
            result.push(group);
        }
        group.events.push(event);
    }
    return result;
});

// Events opened from a shared link may not be in the upcoming list
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
    if (!events.value.find((e) => e.id === event.id)) {
        sharedEvent.value = event;
    }
    baseOpenViewEvent(event);
};
</script>

<template>
    <div class="mx-auto flex w-full max-w-3xl flex-col px-4 pt-4 pb-10 md:px-6 md:pt-8">
        <header class="mb-5 flex items-end justify-between gap-4">
            <div>
                <h1 class="text-display md:text-display-lg m-0">Upcoming</h1>
                <p v-if="!loading && events.length" class="text-meta text-muted mt-1 mb-0">
                    {{ events.length }} {{ events.length === 1 ? 'event' : 'events' }}
                    <template v-if="invitedCount">
                        · <span class="text-amber-200">{{ invitedCount }} waiting for your reply</span>
                    </template>
                </p>
            </div>
        </header>

        <!-- Loading: skeleton in the shape of the content -->
        <div v-if="loading && !events.length" class="flex flex-col gap-3" aria-busy="true">
            <Skeleton height="15rem" border-radius="1.5rem" />
            <Skeleton width="6rem" height="1rem" class="mt-4" />
            <Skeleton height="6rem" border-radius="1rem" />
            <Skeleton height="6rem" border-radius="1rem" />
        </div>

        <div v-else-if="error" class="flex flex-col items-center gap-3 py-20 text-center">
            <i class="pi pi-wifi text-subtle text-2xl"></i>
            <h3 class="text-headline m-0">Couldn't load your events</h3>
            <p class="text-body text-muted m-0 max-w-xs">{{ error }}</p>
            <Button
                label="Try again"
                icon="pi pi-refresh"
                severity="secondary"
                class="mt-2"
                @click="eventsStore.fetchUpcomingEvents"
            />
        </div>

        <div v-else-if="events.length === 0" class="flex flex-col items-center gap-3 py-20 text-center">
            <i class="pi pi-calendar text-subtle text-2xl"></i>
            <h3 class="text-headline m-0">Nothing on the horizon</h3>
            <p class="text-body text-muted m-0 max-w-xs">When someone plans something, it shows up here.</p>
            <router-link :to="{ name: 'calendar' }" class="mt-2">
                <Button label="Plan something" icon="pi pi-plus" />
            </router-link>
        </div>

        <div v-else class="flex flex-col gap-8">
            <section v-if="heroEvent" aria-label="Next up" class="animate-rise-in">
                <UpcomingHeroCard :event="heroEvent" @view="openViewEvent" />
            </section>

            <section v-for="(group, index) in groups" :key="group.key" class="flex flex-col gap-2">
                <h2
                    class="text-body text-fg bg-canvas/90 sticky top-[env(safe-area-inset-top)] z-10 m-0 -mx-4 flex items-baseline gap-2 px-4 py-2 font-semibold backdrop-blur-md md:-mx-6 md:px-6 lg:top-(--app-header-height)"
                >
                    {{ group.label }}
                    <span v-if="group.date" class="text-meta text-subtle font-medium">{{ group.date }}</span>
                </h2>
                <div class="flex flex-col gap-2">
                    <EventListItem
                        v-for="event in group.events"
                        :key="event.id"
                        :event="event"
                        class="animate-rise-in"
                        :style="{ animationDelay: `${Math.min(index, 6) * 40}ms` }"
                        @open="openViewEvent"
                    />
                </div>
            </section>
        </div>

        <EventViewDialog
            v-model:visible="showViewDialog"
            :event="selectedEvent"
            @delete="handleDeleteEvent"
            @edit="handleEditEvent"
            @open-audit-log="selectedEvent && openAuditLogEvent(selectedEvent)"
        />

        <EventChatDialog v-model:visible="showChatDialog" :event="selectedEvent" />

        <EventAuditLogDialog v-model:visible="showAuditLogDialog" :event="selectedEvent" />

        <EventEditDialog
            v-model:visible="showEditDialog"
            :event="eventToEdit"
            @saved="eventsStore.fetchUpcomingEvents"
            @deleted="handleDeleteEvent"
        />
    </div>
</template>
