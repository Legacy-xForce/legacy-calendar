<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, defineAsyncComponent } from 'vue';
import { format } from 'date-fns';
import { useCalendar } from '../composables/useCalendar';
import { useEventsStore } from '../stores/events';
import { useToast } from 'primevue/usetoast';
import CalendarCell from '../components/calendar/CalendarCell.vue';
import Button from 'primevue/button';
import ProgressSpinner from 'primevue/progressspinner';
import type { CalendarDay } from '../types/Calendar';
import type { CreateEventDto } from '../types/Event';

const EventDialog = defineAsyncComponent(() => import('../components/calendar/EventDialog.vue'));
const EventViewDialog = defineAsyncComponent(() => import('../components/calendar/EventViewDialog.vue'));
const EventChatDialog = defineAsyncComponent(() => import('../components/calendar/event-view/EventChatDialog.vue'));
const EventAuditLogDialog = defineAsyncComponent(
    () => import('../components/calendar/event-view/EventAuditLogDialog.vue')
);
const EventEditDialog = defineAsyncComponent(() => import('../components/calendar/EventEditDialog.vue'));
const DayViewDialog = defineAsyncComponent(() => import('../components/calendar/DayViewDialog.vue'));

const toast = useToast();
const eventsStore = useEventsStore();
const {
    currentDate,
    days,
    events,
    isTodayMonth,
    nextMonth,
    prevMonth,
    goToToday,
    prefetchNextMonth,
    prefetchPrevMonth,
    prefetchTodayMonth,
    addEvent,
    loading,
    error
} = useCalendar();

const showDialog = ref(false);
const selectedDate = ref(new Date());

const openAddEvent = (date: Date) => {
    selectedDate.value = date;
    showDialog.value = true;
};

const isSaving = ref(false);

const handleSaveEvent = async (eventData: CreateEventDto) => {
    isSaving.value = true;
    try {
        const success = await addEvent(eventData);
        if (success) {
            toast.add({
                severity: 'success',
                summary: 'Event Created',
                detail: `"${eventData.title}" has been added`,
                life: 3000
            });
            showDialog.value = false;
        } else {
            toast.add({
                severity: 'error',
                summary: 'Error',
                detail: error.value || 'Failed to create event',
                life: 4000
            });
        }
    } finally {
        isSaving.value = false;
    }
};

import { useEventDialogs } from '../composables/useEventDialogs';

const {
    showViewDialog,
    showEditDialog,
    showChatDialog,
    showAuditLogDialog,
    eventToEdit,
    selectedEvent,
    openViewEvent,
    openAuditLogEvent,
    handleEditEvent,
    handleDeleteEvent,
    navigationError
} = useEventDialogs(events);

// Day View state
const showDayViewDialog = ref(false);
const selectedDay = ref<CalendarDay | null>(null);

const handleZoomDay = (day: CalendarDay) => {
    selectedDay.value = day;
    showDayViewDialog.value = true;
};

const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const mobileBreakpoint = '(max-width: 767px)';
const isMobile = ref(false);
let mobileMediaQuery: MediaQueryList | null = null;

const syncIsMobile = (source?: MediaQueryList | MediaQueryListEvent) => {
    isMobile.value = source?.matches ?? mobileMediaQuery?.matches ?? false;
};

const touchStartX = ref(0);
const touchEndX = ref(0);

const handleTouchStart = (e: TouchEvent) => {
    touchStartX.value = e.changedTouches[0]?.screenX ?? 0;
};

const handleTouchEnd = (e: TouchEvent) => {
    touchEndX.value = e.changedTouches[0]?.screenX ?? 0;
    handleSwipe();
};

const handleSwipe = () => {
    const swipeThreshold = 50;
    if (touchEndX.value < touchStartX.value - swipeThreshold) {
        nextMonth();
    }
    if (touchEndX.value > touchStartX.value + swipeThreshold) {
        prevMonth();
    }
};

onMounted(() => {
    mobileMediaQuery = window.matchMedia(mobileBreakpoint);
    syncIsMobile(mobileMediaQuery);
    mobileMediaQuery.addEventListener('change', syncIsMobile);
});

onBeforeUnmount(() => {
    mobileMediaQuery?.removeEventListener('change', syncIsMobile);
});
</script>

<template>
    <div class="flex h-[calc(100vh-4rem)] w-full flex-col gap-3 p-0 lg:p-4 lg:pt-0">
        <!-- Loading Overlay -->
        <div v-if="loading && !isSaving" class="absolute inset-0 z-50 flex items-center justify-center bg-black/50">
            <ProgressSpinner />
        </div>

        <!-- Header -->
        <div class="flex flex-row items-center justify-between gap-2">
            <div class="flex items-center gap-1 sm:gap-2">
                <Button
                    icon="pi pi-chevron-left"
                    @click="prevMonth"
                    @mouseenter="prefetchPrevMonth"
                    @focus="prefetchPrevMonth"
                    text
                    rounded
                    aria-label="Previous Month"
                    class="p-1! sm:p-2!"
                />
                <Button
                    icon="pi pi-chevron-right"
                    @click="nextMonth"
                    @mouseenter="prefetchNextMonth"
                    @focus="prefetchNextMonth"
                    text
                    rounded
                    aria-label="Next Month"
                    class="p-1! sm:p-2!"
                />
            </div>
            <h1
                class="text-surface-900 dark:text-surface-0 text-lg font-bold whitespace-nowrap sm:text-2xl md:text-3xl"
            >
                {{ format(currentDate, 'MMMM yyyy') }}
            </h1>
            <div class="flex min-w-[60px] justify-end sm:min-w-[100px]">
                <Transition name="fade-scale">
                    <Button
                        v-if="!isTodayMonth"
                        label="Today"
                        icon="pi pi-calendar"
                        @click="goToToday"
                        @mouseenter="prefetchTodayMonth"
                        @focus="prefetchTodayMonth"
                        outlined
                        severity="secondary"
                        size="small"
                        class="rounded-xl! text-xs! sm:text-sm!"
                    />
                </Transition>
            </div>
        </div>

        <!-- Calendar Grid -->
        <div
            class="calendar-grid flex flex-1 flex-col overflow-hidden md:overflow-hidden"
            @touchstart="handleTouchStart"
            @touchend="handleTouchEnd"
        >
            <!-- Weekday Headers -->
            <div class="grid grid-cols-7">
                <div
                    v-for="day in weekDays"
                    :key="day"
                    class="weekday-header text-surface-500 p-1 text-center text-[10px] font-medium tracking-wider uppercase md:p-3 md:text-sm"
                >
                    {{ day }}
                </div>
            </div>

            <!-- Days Grid -->
            <div class="days-grid flex-1">
                <CalendarCell
                    v-for="day in days"
                    :key="day.date.toISOString()"
                    :day="day"
                    :is-mobile="isMobile"
                    @add-event="openAddEvent"
                    @view-event="openViewEvent"
                    @zoom-day="handleZoomDay"
                />
            </div>
        </div>

        <!-- Event Dialog -->
        <EventDialog
            v-model:visible="showDialog"
            :initial-date="selectedDate"
            @save="handleSaveEvent"
            :loading="isSaving"
        />

        <!-- Event View Dialog -->
        <EventViewDialog
            v-model:visible="showViewDialog"
            :event="selectedEvent"
            :navigation-error="navigationError"
            @delete="handleDeleteEvent"
            @edit="handleEditEvent"
            @open-audit-log="selectedEvent && openAuditLogEvent(selectedEvent)"
        />

        <!-- Event Chat Dialog -->
        <EventChatDialog v-model:visible="showChatDialog" :event="selectedEvent" />

        <EventAuditLogDialog v-model:visible="showAuditLogDialog" :event="selectedEvent" />

        <!-- Event Edit Dialog -->
        <EventEditDialog
            v-model:visible="showEditDialog"
            :event="eventToEdit"
            @saved="eventsStore.refreshActiveRange"
            @deleted="handleDeleteEvent"
        />

        <!-- Day View Dialog -->
        <DayViewDialog
            v-model:visible="showDayViewDialog"
            :day="selectedDay"
            @add-event="openAddEvent"
            @view-event="openViewEvent"
        />
    </div>
</template>

<style scoped>
/* Days grid - uniform grid layout for all sizes */
.days-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    grid-auto-rows: minmax(80px, 1fr);
    gap: 1px;
    background-color: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.001);
    overflow-y: auto;
    /* Hide scrollbar but keep functionality */
    scrollbar-width: none;
    -ms-overflow-style: none;
}

.days-grid::-webkit-scrollbar {
    display: none;
}

@media (min-width: 768px) {
    .days-grid {
        grid-auto-rows: 1fr;
        overflow: hidden;
    }
}

.fade-scale-enter-active,
.fade-scale-leave-active {
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.fade-scale-enter-from,
.fade-scale-leave-to {
    opacity: 0;
    transform: scale(0.95);
}
</style>
