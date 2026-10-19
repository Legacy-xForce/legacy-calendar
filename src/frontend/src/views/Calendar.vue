<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, defineAsyncComponent } from 'vue';
import { format, isSameDay, isSameMonth, startOfMonth, isToday as isTodayDate } from 'date-fns';
import { useCalendar } from '../composables/useCalendar';
import { useEventsStore } from '../stores/events';
import { useSessionStore } from '../stores/session';
import { usePreferencesStore } from '../stores/preferences';
import { storeToRefs } from 'pinia';
import { useToast } from 'primevue/usetoast';
import Button from 'primevue/button';
import CalendarCell from '../components/calendar/CalendarCell.vue';
import EventListItem from '../components/EventListItem.vue';
import { useEventDialogs, createEventViewDialogs } from '../composables/useEventDialogs';
import { useMediaQuery, MOBILE_QUERY } from '../composables/useMediaQuery';
import { getUserEventRole } from '../utils/event';
import { normalizeHexColor } from '../utils/color';
import { DEFAULT_COLOR } from '../constants/colors';
import type { CalendarDay } from '../types/Calendar';
import type { CreateEventDto, Event } from '../types/Event';

const EventDialog = defineAsyncComponent(() => import('../components/calendar/EventDialog.vue'));
const { EventViewDialog, EventChatDialog, EventAuditLogDialog, EventEditDialog } = createEventViewDialogs();
const DayViewDialog = defineAsyncComponent(() => import('../components/calendar/DayViewDialog.vue'));

const toast = useToast();
const eventsStore = useEventsStore();
const sessionStore = useSessionStore();
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

const isMobile = useMediaQuery(MOBILE_QUERY);

// On phones the user picks between the agenda layout and a full month grid (see Profile)
const preferencesStore = usePreferencesStore();
const { mobileCalendarLayout } = storeToRefs(preferencesStore);
const showAgenda = computed(() => isMobile.value && mobileCalendarLayout.value === 'agenda');
const compactGrid = computed(() => isMobile.value && mobileCalendarLayout.value === 'grid');

// ---------- Month navigation ----------

const direction = ref<'next' | 'prev'>('next');
const monthKey = computed(() => format(currentDate.value, 'yyyy-MM'));

const goNext = () => {
    direction.value = 'next';
    nextMonth();
};

const goPrev = () => {
    direction.value = 'prev';
    prevMonth();
};

const goToday = () => {
    direction.value = currentDate.value > new Date() ? 'prev' : 'next';
    selectedDate.value = new Date();
    void goToToday();
};

// ---------- Selection (mobile agenda) ----------

const selectedDate = ref(new Date());

watch(currentDate, (date) => {
    if (isSameMonth(selectedDate.value, date)) return;
    selectedDate.value = isSameMonth(date, new Date()) ? new Date() : startOfMonth(date);
});

const selectedDay = computed<CalendarDay | null>(
    () => days.value.find((day) => isSameDay(day.date, selectedDate.value)) ?? null
);

const selectedDayEvents = computed(() =>
    [...(selectedDay.value?.events ?? [])].sort((a, b) => a.startTime.localeCompare(b.startTime))
);

const selectDay = (day: CalendarDay) => {
    selectedDate.value = day.date;
    if (!day.isCurrentMonth) {
        direction.value = day.date > currentDate.value ? 'next' : 'prev';
        currentDate.value = day.date;
    }
};

const isSelected = (day: CalendarDay) => isSameDay(day.date, selectedDate.value);

const dayNumberClass = (day: CalendarDay) => {
    const selected = isSelected(day);
    if (selected && day.isToday) return 'bg-accent text-primary-contrast font-semibold';
    if (selected) return 'bg-fg text-primary-contrast font-semibold';
    if (day.isToday) return 'text-accent font-semibold';
    if (!day.isCurrentMonth) return 'text-surface-700';
    if (day.isPast) return 'text-muted';
    return 'text-fg';
};

const currentUserId = computed(() => sessionStore.currentUser?.id);

const dotStyle = (event: Event) => {
    const color = normalizeHexColor(event.color, DEFAULT_COLOR);
    const invited = getUserEventRole(event, currentUserId.value) === 'invited';
    return invited ? { boxShadow: `inset 0 0 0 1.5px ${color}` } : { background: color };
};

// ---------- Swipe between months ----------

let touchStart: { x: number; y: number } | null = null;

const handleTouchStart = (e: TouchEvent) => {
    const touch = e.changedTouches[0];
    touchStart = touch ? { x: touch.clientX, y: touch.clientY } : null;
};

const handleTouchEnd = (e: TouchEvent) => {
    const touch = e.changedTouches[0];
    if (!touchStart || !touch) return;
    const dx = touch.clientX - touchStart.x;
    const dy = touch.clientY - touchStart.y;
    touchStart = null;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    if (dx < 0) goNext();
    else goPrev();
};

// ---------- Desktop: fit as many chips as each cell can show ----------

const gridRef = ref<HTMLElement | null>(null);
const gridHeight = ref(0);
let resizeObserver: ResizeObserver | null = null;

const rowCount = computed(() => Math.max(1, Math.ceil(days.value.length / 7)));
const maxVisibleEvents = computed(() => {
    if (!gridHeight.value) return 3;
    const cellHeight = gridHeight.value / rowCount.value;
    // Date row plus one chip row each (incl. gap): 34 / 24px, or 26 / 20px in the compact phone grid
    const [dateRow, chipRow] = compactGrid.value ? [26, 20] : [34, 24];
    return Math.max(1, Math.floor((cellHeight - dateRow) / chipRow));
});

watch(gridRef, (el, _, onCleanup) => {
    if (!el) return;
    resizeObserver = new ResizeObserver(([entry]) => {
        gridHeight.value = entry?.contentRect.height ?? 0;
    });
    resizeObserver.observe(el);
    onCleanup(() => resizeObserver?.disconnect());
});

// ---------- Creating events ----------

const showDialog = ref(false);
const createDate = ref(new Date());
const isSaving = ref(false);

/** Sensible default start: the next full hour today, otherwise 20:00 on the chosen day. */
const withDefaultStartTime = (date: Date) => {
    const result = new Date(date);
    if (isTodayDate(result)) {
        const now = new Date();
        result.setHours(Math.min(now.getHours() + 1, 23), 0, 0, 0);
    } else {
        result.setHours(20, 0, 0, 0);
    }
    return result;
};

const openAddEvent = (date: Date) => {
    createDate.value = withDefaultStartTime(date);
    showDialog.value = true;
};

const openAddEventForSelection = () => {
    const today = new Date();
    const base = selectedDay.value && !selectedDay.value.isPast ? selectedDate.value : today;
    openAddEvent(base);
};

const handleSaveEvent = async (eventData: CreateEventDto) => {
    isSaving.value = true;
    try {
        const success = await addEvent(eventData);
        if (success) {
            toast.add({
                severity: 'success',
                summary: 'Event created',
                detail: `"${eventData.title}" is on the calendar`,
                life: 3000
            });
            selectedDate.value = new Date(eventData.startTime);
            showDialog.value = false;
        } else {
            toast.add({
                severity: 'error',
                summary: 'Could not create event',
                detail: error.value || 'Please try again.',
                life: 4000
            });
        }
    } finally {
        isSaving.value = false;
    }
};

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

// ---------- Desktop day overview ----------

const showDayViewDialog = ref(false);
const zoomedDay = ref<CalendarDay | null>(null);

const handleZoomDay = (day: CalendarDay) => {
    zoomedDay.value = day;
    showDayViewDialog.value = true;
};

// ---------- Keyboard shortcuts (desktop) ----------

const handleKeydown = (e: KeyboardEvent) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (document.querySelector('.p-dialog-mask')) return;

    if (e.key === 'ArrowRight') goNext();
    else if (e.key === 'ArrowLeft') goPrev();
    else if (e.key === 't' || e.key === 'T') goToday();
    else if (e.key === 'n' || e.key === 'N') openAddEventForSelection();
    else return;
    e.preventDefault();
};

onMounted(() => window.addEventListener('keydown', handleKeydown));
onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleKeydown);
    resizeObserver?.disconnect();
});

const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const selectedDayLabel = computed(() => {
    if (isTodayDate(selectedDate.value)) return 'Today';
    return format(selectedDate.value, 'EEEE');
});
</script>

<template>
    <div
        class="flex w-full flex-col md:h-[calc(100dvh-var(--tabbar-height)-env(safe-area-inset-bottom)-env(safe-area-inset-top))] lg:h-[calc(100dvh-var(--app-header-height))]"
        :class="{
            'h-[calc(100dvh-var(--tabbar-height)-env(safe-area-inset-bottom)-env(safe-area-inset-top))]': compactGrid
        }"
    >
        <!-- Month header -->
        <div class="flex items-center gap-2 px-4 pt-4 pb-3 md:px-6 md:pt-5">
            <h1 class="text-display md:text-display-lg m-0 flex items-baseline gap-2">
                <span>{{ format(currentDate, 'MMMM') }}</span>
                <span class="text-subtle font-medium">{{ format(currentDate, 'yyyy') }}</span>
            </h1>

            <div class="ml-auto flex items-center gap-1">
                <Transition name="fade">
                    <button
                        v-if="!isTodayMonth || (showAgenda && !isTodayDate(selectedDate))"
                        type="button"
                        class="pressable text-meta border-line text-fg hover:bg-surface-900 mr-1 h-9 rounded-full border px-3.5 font-medium"
                        @click="goToday"
                        @mouseenter="prefetchTodayMonth"
                        @focus="prefetchTodayMonth"
                    >
                        Today
                    </button>
                </Transition>
                <button
                    type="button"
                    class="pressable text-muted hover:bg-surface-900 hover:text-fg flex size-9 items-center justify-center rounded-full"
                    aria-label="Previous month"
                    @click="goPrev"
                    @mouseenter="prefetchPrevMonth"
                    @focus="prefetchPrevMonth"
                >
                    <i class="pi pi-chevron-left text-sm"></i>
                </button>
                <button
                    type="button"
                    class="pressable text-muted hover:bg-surface-900 hover:text-fg flex size-9 items-center justify-center rounded-full"
                    aria-label="Next month"
                    @click="goNext"
                    @mouseenter="prefetchNextMonth"
                    @focus="prefetchNextMonth"
                >
                    <i class="pi pi-chevron-right text-sm"></i>
                </button>
                <button
                    v-if="isMobile"
                    type="button"
                    class="pressable text-muted hover:bg-surface-900 hover:text-fg flex size-9 items-center justify-center rounded-full"
                    :aria-label="showAgenda ? 'Show full month' : 'Show agenda'"
                    @click="preferencesStore.toggleMobileCalendarLayout"
                >
                    <i :class="showAgenda ? 'pi pi-th-large' : 'pi pi-list'" class="text-sm"></i>
                </button>
                <button
                    v-if="compactGrid"
                    type="button"
                    class="pressable bg-accent text-primary-contrast ml-1 flex size-9 items-center justify-center rounded-full"
                    aria-label="New event"
                    @click="openAddEventForSelection"
                >
                    <i class="pi pi-plus text-sm"></i>
                </button>
                <Button
                    v-if="!isMobile"
                    label="New event"
                    icon="pi pi-plus"
                    size="small"
                    class="ml-2"
                    v-tooltip.bottom="'Shortcut: N'"
                    @click="openAddEventForSelection"
                />
            </div>
        </div>

        <!-- Loading hairline (keeps the grid visible instead of covering it) -->
        <div class="relative h-px overflow-hidden">
            <div v-if="loading && !isSaving" class="loading-bar"></div>
        </div>

        <Transition name="fade" mode="out-in">
            <!-- ===== Mobile agenda layout: compact month + the selected day's events ===== -->
            <div v-if="showAgenda" key="agenda">
                <div class="px-2 pt-2" @touchstart.passive="handleTouchStart" @touchend.passive="handleTouchEnd">
                    <div class="grid grid-cols-7 pb-1">
                        <span
                            v-for="day in weekDays"
                            :key="day"
                            class="text-subtle text-center text-[0.6875rem] font-medium"
                            :aria-label="day"
                        >
                            {{ day.charAt(0) }}
                        </span>
                    </div>
                    <Transition :name="`month-${direction}`" mode="out-in">
                        <div :key="monthKey" class="grid grid-cols-7" role="grid">
                            <button
                                v-for="day in days"
                                :key="day.date.toISOString()"
                                type="button"
                                class="group flex h-[3.25rem] flex-col items-center gap-1 pt-1 focus-visible:outline-none"
                                :aria-label="format(day.date, 'EEEE d MMMM') + `, ${day.events.length} events`"
                                :aria-pressed="isSelected(day)"
                                @click="selectDay(day)"
                            >
                                <span
                                    class="text-body tabular group-focus-visible:ring-accent flex size-8 items-center justify-center rounded-full transition-colors duration-150 group-focus-visible:ring-2 group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-black"
                                    :class="dayNumberClass(day)"
                                >
                                    {{ day.date.getDate() }}
                                </span>
                                <span
                                    class="flex h-1.5 items-center gap-[3px]"
                                    :class="{ 'opacity-40': !day.isCurrentMonth }"
                                >
                                    <span
                                        v-for="event in day.events.slice(0, 3)"
                                        :key="event.id"
                                        class="size-1.5 rounded-full"
                                        :style="dotStyle(event)"
                                    ></span>
                                </span>
                            </button>
                        </div>
                    </Transition>
                </div>

                <section class="border-line mt-2 border-t px-4 pt-4 pb-24" aria-live="polite">
                    <div class="mb-3 flex items-baseline justify-between gap-3">
                        <h2 class="text-headline m-0">
                            {{ selectedDayLabel }}
                            <span class="text-subtle font-medium">{{ format(selectedDate, 'd MMMM') }}</span>
                        </h2>
                        <span v-if="selectedDayEvents.length" class="text-meta text-muted tabular">
                            {{ selectedDayEvents.length }} {{ selectedDayEvents.length === 1 ? 'event' : 'events' }}
                        </span>
                    </div>

                    <Transition name="fade" mode="out-in">
                        <TransitionGroup
                            v-if="selectedDayEvents.length"
                            :key="selectedDate.toDateString()"
                            tag="div"
                            name="list"
                            appear
                            class="flex flex-col gap-2"
                        >
                            <EventListItem
                                v-for="event in selectedDayEvents"
                                :key="event.id"
                                :event="event"
                                @open="openViewEvent"
                            />
                        </TransitionGroup>
                        <div
                            v-else
                            :key="`empty-${selectedDate.toDateString()}`"
                            class="border-line flex flex-col items-center gap-3 rounded-2xl border border-dashed px-6 py-8 text-center"
                        >
                            <p class="text-body text-muted m-0">
                                {{ selectedDay?.isPast ? 'Nothing happened this day.' : 'Nothing planned yet.' }}
                            </p>
                            <Button
                                v-if="!selectedDay?.isPast"
                                label="Plan something"
                                icon="pi pi-plus"
                                severity="secondary"
                                size="small"
                                @click="openAddEvent(selectedDate)"
                            />
                        </div>
                    </Transition>
                </section>

                <button
                    type="button"
                    class="pressable bg-accent text-primary-contrast fixed right-4 bottom-[calc(var(--tabbar-height)+env(safe-area-inset-bottom)+1rem)] z-40 flex size-14 items-center justify-center rounded-2xl shadow-[0_12px_32px_-8px_rgb(0_0_0/0.9)]"
                    aria-label="New event"
                    @click="openAddEventForSelection"
                >
                    <i class="pi pi-plus text-xl"></i>
                </button>
            </div>

            <!-- ===== Full month grid: desktop, and the "grid" layout on phones ===== -->
            <div
                v-else
                key="grid"
                class="flex min-h-0 flex-1 flex-col"
                :class="compactGrid ? 'px-1 pb-1' : 'px-3 pb-3 md:px-4 md:pb-4'"
                @touchstart.passive="handleTouchStart"
                @touchend.passive="handleTouchEnd"
            >
                <div class="grid grid-cols-7">
                    <div
                        v-for="day in weekDays"
                        :key="day"
                        class="text-subtle font-medium"
                        :class="compactGrid ? 'py-1.5 text-center text-[0.6875rem]' : 'text-meta px-2.5 py-2'"
                        :aria-label="day"
                    >
                        {{ compactGrid ? day.charAt(0) : day }}
                    </div>
                </div>
                <div
                    ref="gridRef"
                    class="border-surface-900 min-h-0 flex-1 overflow-hidden border"
                    :class="compactGrid ? 'rounded-xl' : 'rounded-2xl'"
                >
                    <Transition :name="`month-${direction}`" mode="out-in">
                        <div
                            :key="monthKey"
                            class="bg-surface-900 grid h-full grid-cols-7 gap-px"
                            :style="{ gridTemplateRows: `repeat(${rowCount}, minmax(0, 1fr))` }"
                        >
                            <CalendarCell
                                v-for="day in days"
                                :key="day.date.toISOString()"
                                :day="day"
                                :max-visible="maxVisibleEvents"
                                :compact="compactGrid"
                                @add-event="openAddEvent"
                                @view-event="openViewEvent"
                                @zoom-day="handleZoomDay"
                            />
                        </div>
                    </Transition>
                </div>
            </div>
        </Transition>

        <EventDialog
            v-model:visible="showDialog"
            :initial-date="createDate"
            @save="handleSaveEvent"
            :loading="isSaving"
        />

        <EventViewDialog
            v-model:visible="showViewDialog"
            :event="selectedEvent"
            :navigation-error="navigationError"
            @delete="handleDeleteEvent"
            @edit="handleEditEvent"
            @open-audit-log="selectedEvent && openAuditLogEvent(selectedEvent)"
        />

        <EventChatDialog v-model:visible="showChatDialog" :event="selectedEvent" />

        <EventAuditLogDialog v-model:visible="showAuditLogDialog" :event="selectedEvent" />

        <EventEditDialog
            v-model:visible="showEditDialog"
            :event="eventToEdit"
            @saved="eventsStore.refreshActiveRange"
            @deleted="handleDeleteEvent"
        />

        <DayViewDialog
            v-model:visible="showDayViewDialog"
            :day="zoomedDay"
            @add-event="openAddEvent"
            @view-event="openViewEvent"
        />
    </div>
</template>

<style scoped>
.month-next-enter-active,
.month-prev-enter-active {
    transition:
        opacity 200ms var(--ease-out-quart),
        transform 320ms var(--ease-out-expo);
}

.month-next-leave-active,
.month-prev-leave-active {
    transition:
        opacity 90ms var(--ease-in-quart),
        transform 90ms var(--ease-in-quart);
}

.month-next-enter-from {
    opacity: 0;
    transform: translateX(24px);
}

.month-next-leave-to {
    opacity: 0;
    transform: translateX(-12px);
}

.month-prev-enter-from {
    opacity: 0;
    transform: translateX(-24px);
}

.month-prev-leave-to {
    opacity: 0;
    transform: translateX(12px);
}

.loading-bar {
    position: absolute;
    inset: 0;
    width: 40%;
    background: linear-gradient(90deg, transparent, var(--color-accent), transparent);
    animation: loading-slide 1s var(--ease-out-quart) infinite;
}

@keyframes loading-slide {
    from {
        transform: translateX(-100%);
    }
    to {
        transform: translateX(250%);
    }
}
</style>
