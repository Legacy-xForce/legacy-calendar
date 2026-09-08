import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import api from '../services/API';
import type { CalendarVisibleRange } from '../types/Calendar';
import type { CreateEventDto, Event, ParticipateDto } from '../types/Event';
import { createLogger } from '../services/logger';

const monthRequestCache = new Map<string, Promise<Event[]>>();
const visibleLoadSequence = new Map<string, number>();
const logger = createLogger('EventsStore');

export const useEventsStore = defineStore('events', () => {
    const events = ref<Event[]>([]);
    const loading = ref(false);
    const error = ref<string | null>(null);
    const lastErrorStatus = ref<number | null>(null);
    const activeRange = ref<CalendarVisibleRange | null>(null);
    const rangeCache = ref<Record<string, Event[]>>({});
    const upcomingEvents = ref<Event[]>([]);
    const pendingRequests = ref(0);

    // --- Helpers ---

    async function mutateAndRefresh<T>(errorMessage: string, action: () => Promise<T>): Promise<boolean> {
        const result = await runEventsAction(errorMessage, action);
        if (result !== false) {
            await refreshAllData();
        }
        return result !== false;
    }

    async function runEventsAction<T>(
        errorMessage: string,
        action: () => Promise<T>,
        options: { trackLoading?: boolean; clearError?: boolean; logError?: boolean } = {}
    ): Promise<T | false> {
        const { trackLoading = true, clearError = true, logError = true } = options;

        if (trackLoading) {
            pendingRequests.value += 1;
            loading.value = true;
        }

        if (clearError) {
            error.value = null;
            lastErrorStatus.value = null;
        }

        try {
            return await action();
        } catch (err: any) {
            if (logError) {
                error.value = err.response?.data?.message || errorMessage;
                lastErrorStatus.value = err.response?.status ?? null;
                logger.warn(errorMessage, {
                    status: err.response?.status,
                    message: err.response?.data?.message ?? err.message
                });
            }
            return false;
        } finally {
            if (trackLoading) {
                pendingRequests.value = Math.max(0, pendingRequests.value - 1);
                loading.value = pendingRequests.value > 0;
            }
        }
    }

    async function loadCalendarEvents(range: CalendarVisibleRange, dedupe = false): Promise<Event[]> {
        const rangeKey = range.monthKey;

        if (dedupe) {
            const inFlightRequest = monthRequestCache.get(rangeKey);
            if (inFlightRequest) {
                logger.trace('Reusing in-flight calendar request', { rangeKey });
                return inFlightRequest;
            }
        }

        const request = (async () => {
            const response = await api.findCalendarEvents(range);
            return response.data;
        })();

        if (dedupe) {
            monthRequestCache.set(rangeKey, request);
        }

        try {
            logger.debug('Loading calendar events from API', { rangeKey, dedupe });
            return await request;
        } finally {
            if (dedupe) {
                monthRequestCache.delete(rangeKey);
            }
        }
    }

    function storeVisibleEvents(rangeKey: string, eventsList: Event[], applyToVisible: boolean) {
        const nextEvents = [...eventsList];
        rangeCache.value[rangeKey] = nextEvents;

        if (applyToVisible && activeRange.value?.monthKey === rangeKey) {
            events.value = nextEvents;
        }
    }

    async function loadAndStoreCalendarEvents(
        range: CalendarVisibleRange,
        applyToVisible: boolean,
        dedupe: boolean,
        errorMessage: string
    ): Promise<boolean> {
        const rangeKey = range.monthKey;
        const requestId = applyToVisible ? (visibleLoadSequence.get(rangeKey) ?? 0) + 1 : 0;

        if (applyToVisible) {
            visibleLoadSequence.set(rangeKey, requestId);
            activeRange.value = cloneRange(range);
            logger.info('Loading visible calendar range', { rangeKey });
            lastErrorStatus.value = null;

            const cachedEvents = rangeCache.value[rangeKey];
            if (cachedEvents) {
                events.value = [...cachedEvents];
                logger.trace('Applied cached calendar events', { rangeKey, count: cachedEvents.length });
            }
        }

        const result = await runEventsAction(
            errorMessage,
            async () => {
                const fetchedEvents = await loadCalendarEvents(range, dedupe);

                if (applyToVisible) {
                    const latestVisibleRequest = visibleLoadSequence.get(rangeKey);
                    if (latestVisibleRequest !== requestId || activeRange.value?.monthKey !== rangeKey) {
                        return true;
                    }
                }

                storeVisibleEvents(rangeKey, fetchedEvents, applyToVisible);
                logger.info('Calendar range loaded', { rangeKey, count: fetchedEvents.length });
                return true;
            },
            {
                trackLoading: applyToVisible,
                clearError: applyToVisible,
                logError: applyToVisible
            }
        );

        return result !== false;
    }

    function cloneRange(range: CalendarVisibleRange): CalendarVisibleRange {
        return {
            monthKey: range.monthKey,
            start: new Date(range.start),
            end: new Date(range.end)
        };
    }

    function areSameMonthRange(a: CalendarVisibleRange | null, b: CalendarVisibleRange) {
        return a?.monthKey === b.monthKey;
    }

    function hasCachedOrActiveMonth(range: CalendarVisibleRange) {
        return rangeCache.value[range.monthKey] !== undefined || areSameMonthRange(activeRange.value, range);
    }

    async function refreshAllData() {
        logger.debug('Refreshing all event data');
        return Promise.all([refreshActiveRange(), fetchUpcomingEvents()]);
    }

    // --- Getters ---

    const getEventsByDate = computed(() => {
        return (date: Date) => {
            const targetDate = new Date(date);
            targetDate.setHours(0, 0, 0, 0);

            return events.value.filter((event) => {
                const eventDate = new Date(event.startTime);
                eventDate.setHours(0, 0, 0, 0);
                return eventDate.getTime() === targetDate.getTime();
            });
        };
    });

    const getEventById = computed(() => {
        return (id: number) => events.value.find((event) => event.id === id);
    });

    // --- Actions ---

    async function fetchEvents() {
        logger.debug('Fetching events for active range');
        return refreshActiveRange();
    }

    async function fetchCalendarEvents(
        range: CalendarVisibleRange,
        options: { refresh?: boolean; applyToVisible?: boolean } = {}
    ) {
        const { refresh = true, applyToVisible = true } = options;
        const rangeKey = range.monthKey;

        if (applyToVisible && !refresh && rangeCache.value[rangeKey]) {
            activeRange.value = cloneRange(range);
            events.value = [...rangeCache.value[rangeKey]];
            logger.trace('Using cached visible calendar range', { rangeKey });
            return true;
        }

        const dedupe = monthRequestCache.has(rangeKey);
        return loadAndStoreCalendarEvents(range, applyToVisible, dedupe, 'Failed to load events');
    }

    async function refreshActiveRange() {
        if (!activeRange.value) {
            return false;
        }

        logger.debug('Refreshing active calendar range', { rangeKey: activeRange.value.monthKey });
        return fetchCalendarEvents(activeRange.value, { refresh: true, applyToVisible: true });
    }

    async function prefetchCalendarEvents(range: CalendarVisibleRange) {
        if (hasCachedOrActiveMonth(range)) {
            logger.trace('Skipping prefetch for cached month', { rangeKey: range.monthKey });
            return true;
        }

        const result = await runEventsAction(
            'Failed to prefetch events',
            async () => {
                const fetchedEvents = await loadCalendarEvents(range, true);

                if (activeRange.value?.monthKey !== range.monthKey) {
                    storeVisibleEvents(range.monthKey, fetchedEvents, false);
                }

                return true;
            },
            {
                trackLoading: false,
                clearError: false,
                logError: false
            }
        );

        return result !== false;
    }

    async function fetchEventById(id: number) {
        const result = await runEventsAction(`Failed to load event ${id}`, async () => {
            logger.debug('Fetching event by id', { eventId: id });
            const response = await api.findOneEvent(id);
            const index = events.value.findIndex((e) => e.id === id);
            if (index !== -1) {
                events.value[index] = response.data;
            } else {
                events.value.push(response.data);
            }

            const upcomingIndex = upcomingEvents.value.findIndex((e) => e.id === id);
            if (upcomingIndex !== -1) {
                upcomingEvents.value[upcomingIndex] = response.data;
            }
            return true;
        });
        return result !== false;
    }

    async function fetchUpcomingEvents() {
        return runEventsAction('Failed to fetch upcoming events', async () => {
            logger.debug('Fetching upcoming events');
            const response = await api.findUpcomingEvents();
            upcomingEvents.value = response.data;
            logger.info('Upcoming events loaded', { count: upcomingEvents.value.length });
            return true;
        });
    }

    async function createEvent(dto: CreateEventDto) {
        logger.info('Creating event', { title: dto.title });
        return mutateAndRefresh('Failed to create event', () => api.createEvent(dto));
    }

    async function updateEvent(id: number, dto: Partial<CreateEventDto>) {
        logger.info('Updating event', { eventId: id });
        return mutateAndRefresh('Failed to update event', () => api.updateEvent(id, dto));
    }

    async function deleteEvent(id: number) {
        logger.warn('Deleting event', { eventId: id });
        return mutateAndRefresh('Failed to delete event', () => api.deleteEvent(id));
    }

    async function joinEvent(id: number, dto?: ParticipateDto) {
        logger.info('Joining event', { eventId: id });
        return mutateAndRefresh('Failed to join event', () => api.joinEvent(id, dto));
    }

    async function leaveEvent(id: number) {
        logger.info('Leaving event', { eventId: id });
        return mutateAndRefresh('Failed to leave event', () => api.leaveEvent(id));
    }

    async function assignRide(
        eventId: number,
        passengerId: number,
        driverId: number | null,
        direction: 'OUTBOUND' | 'RETURN' = 'OUTBOUND'
    ) {
        logger.info('Assigning ride', { eventId, passengerId, driverId, direction });
        return mutateAndRefresh('Failed to assign ride', () =>
            api.assignRide(eventId, passengerId, driverId, direction)
        );
    }

    async function assignRidesBatch(
        eventId: number,
        passengerIds: number[],
        driverId: number | null,
        direction: 'OUTBOUND' | 'RETURN' = 'OUTBOUND'
    ) {
        logger.info('Assigning rides batch', { eventId, passengerCount: passengerIds.length, driverId, direction });
        return mutateAndRefresh('Failed to assign rides', () =>
            Promise.all(passengerIds.map((id) => api.assignRide(eventId, id, driverId, direction)))
        );
    }

    function clearError() {
        error.value = null;
    }

    return {
        events,
        loading,
        error,
        lastErrorStatus,
        upcomingEvents,
        activeRange,
        rangeCache,
        pendingRequests,
        getEventsByDate,
        getEventById,
        fetchEvents,
        fetchCalendarEvents,
        refreshActiveRange,
        prefetchCalendarEvents,
        fetchUpcomingEvents,
        fetchEventById,
        createEvent,
        updateEvent,
        deleteEvent,
        joinEvent,
        leaveEvent,
        assignRide,
        assignRidesBatch,
        clearError
    };
});
