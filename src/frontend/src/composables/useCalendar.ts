import { ref, computed, watch } from 'vue';
import {
    startOfMonth,
    endOfMonth,
    startOfWeek,
    endOfWeek,
    eachDayOfInterval,
    addMonths,
    subMonths,
    isSameMonth,
    isToday,
    startOfDay,
    parseISO
} from 'date-fns';
import type { CalendarDay, CalendarVisibleRange } from '../types/Calendar';
import type { Event } from '../types/Event';
import { useEventsStore } from '../stores/events';

export function useCalendar() {
    const currentDate = ref(new Date());
    const eventsStore = useEventsStore();

    const events = computed<Event[]>(() => eventsStore.events);

    const buildMonthKey = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        return `${year}-${month}`;
    };

    const buildVisibleRange = (date: Date): CalendarVisibleRange => {
        const monthStart = startOfMonth(date);
        const monthEnd = endOfMonth(monthStart);

        return {
            monthKey: buildMonthKey(date),
            start: startOfWeek(monthStart, { weekStartsOn: 1 }),
            end: endOfWeek(monthEnd, { weekStartsOn: 1 })
        };
    };

    const visibleMonthKey = computed(() => {
        return buildMonthKey(currentDate.value);
    });

    const visibleRange = computed<CalendarVisibleRange>(() => {
        return buildVisibleRange(currentDate.value);
    });

    const buildDayKey = (date: Date) => startOfDay(date).getTime();

    const prefetchRange = async (date: Date) => {
        const range = buildVisibleRange(date);
        await eventsStore.prefetchCalendarEvents(range);
    };

    const refreshVisibleRange = async () => {
        await eventsStore.fetchCalendarEvents(visibleRange.value, { refresh: true, applyToVisible: true });
    };

    const prefetchNextMonth = async () => {
        await prefetchRange(addMonths(currentDate.value, 1));
    };

    const prefetchPrevMonth = async () => {
        await prefetchRange(subMonths(currentDate.value, 1));
    };

    const prefetchTodayMonth = async () => {
        await prefetchRange(new Date());
    };

    const goToToday = async () => {
        const today = new Date();
        const isCurrentVisibleMonth = buildMonthKey(today) === visibleMonthKey.value;

        currentDate.value = today;

        if (isCurrentVisibleMonth) {
            await refreshVisibleRange();
        }
    };

    const eventsByDay = computed<Map<number, Event[]>>(() => {
        const groupedEvents = new Map<number, Event[]>();

        for (const event of events.value) {
            const dayKey = buildDayKey(parseISO(event.startTime));
            const existingEvents = groupedEvents.get(dayKey);

            if (existingEvents) {
                existingEvents.push(event);
            } else {
                groupedEvents.set(dayKey, [event]);
            }
        }

        return groupedEvents;
    });

    const days = computed<CalendarDay[]>(() => {
        const monthStart = startOfMonth(currentDate.value);
        const todayKey = buildDayKey(new Date());
        const { start, end } = visibleRange.value;
        const dates = eachDayOfInterval({ start, end });
        const groupedEvents = eventsByDay.value;

        return dates.map((date) => {
            const dayKey = buildDayKey(date);

            return {
                date,
                isCurrentMonth: isSameMonth(date, monthStart),
                isToday: isToday(date),
                isPast: dayKey < todayKey,
                events: groupedEvents.get(dayKey) ?? []
            };
        });
    });

    watch(
        visibleMonthKey,
        async () => {
            await refreshVisibleRange();
        },
        { immediate: true }
    );

    const nextMonth = () => {
        currentDate.value = addMonths(currentDate.value, 1);
    };

    const prevMonth = () => {
        currentDate.value = subMonths(currentDate.value, 1);
    };

    const isTodayMonth = computed(() => isSameMonth(currentDate.value, new Date()));

    return {
        currentDate,
        days,
        events,
        isTodayMonth,
        loading: computed(() => eventsStore.loading),
        error: computed(() => eventsStore.error),
        nextMonth,
        prevMonth,
        goToToday,
        prefetchNextMonth,
        prefetchPrevMonth,
        prefetchTodayMonth,
        addEvent: eventsStore.createEvent,
        deleteEvent: eventsStore.deleteEvent,
        joinEvent: eventsStore.joinEvent
    };
}
