import { computed, ref, watch, defineAsyncComponent, type Ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useEventsStore } from '../stores/events';
import { useToast } from 'primevue/usetoast';
import { useConfirm } from 'primevue/useconfirm';
import type { Event } from '../types/Event';
import { getCurrentSection, getEventPathPrefix, getRouteAction, parseEventId } from '../utils/route';

/**
 * Async dialogs that stack on top of the event view sheet. Loading them after it
 * keeps them on top when a link (like a chat notification) opens both at once;
 * otherwise the sheet could mount last and cover them.
 */
export function createEventViewDialogs() {
    const loadEventViewDialog = () => import('../components/calendar/EventViewDialog.vue');
    const afterEventView =
        <T>(load: () => Promise<T>) =>
        () =>
            loadEventViewDialog().then(load);

    return {
        EventViewDialog: defineAsyncComponent(loadEventViewDialog),
        EventChatDialog: defineAsyncComponent(
            afterEventView(() => import('../components/calendar/event-view/EventChatDialog.vue'))
        ),
        EventAuditLogDialog: defineAsyncComponent(
            afterEventView(() => import('../components/calendar/event-view/EventAuditLogDialog.vue'))
        ),
        EventEditDialog: defineAsyncComponent(
            afterEventView(() => import('../components/calendar/EventEditDialog.vue'))
        )
    };
}

export function useEventDialogs(events: Ref<Event[]>, externalEvent?: Ref<Event | null>) {
    const eventsStore = useEventsStore();
    const toast = useToast();
    const confirm = useConfirm();
    const route = useRoute();
    const router = useRouter();

    const eventToEdit = ref<Event | null>(null);
    const navigationError = ref<string | null>(null);

    const currentSection = computed(() => getCurrentSection(route.path, route.name));
    const eventPathPrefix = computed(() => getEventPathPrefix(currentSection.value));
    const basePagePath = computed(() => (currentSection.value === 'upcoming' ? '/upcoming' : '/calendar'));
    const selectedEventId = computed(() => parseEventId(route.params.id));
    const routeAction = computed(() => getRouteAction(route.path));

    const selectedEvent = computed(() => {
        if (!selectedEventId.value) return null;

        const event = events.value.find((e) => e.id === selectedEventId.value);
        if (event) return event;

        if (externalEvent?.value && externalEvent.value.id === selectedEventId.value) {
            return externalEvent.value;
        }

        return null;
    });

    const closeEventState = async () => {
        await router.replace({ path: basePagePath.value });
    };

    const closeOverlayToEvent = async () => {
        if (!selectedEventId.value) {
            await closeEventState();
            return;
        }

        await router.replace({ path: `${eventPathPrefix.value}/${selectedEventId.value}` });
    };

    const closeAuditLogDialog = async () => {
        if (!selectedEventId.value) {
            await closeEventState();
            return;
        }

        try {
            navigationError.value = null;
            await router.push({ path: `${eventPathPrefix.value}/${selectedEventId.value}` });
        } catch (error) {
            navigationError.value = error instanceof Error ? error.message : 'Failed to close the audit log panel.';
        }
    };

    const showViewDialogState = computed({
        get: () => selectedEventId.value !== null,
        set: (visible: boolean) => {
            if (visible) return;

            void closeEventState();
        }
    });

    const showEditDialogState = computed({
        get: () => routeAction.value === 'edit' && selectedEventId.value !== null,
        set: (visible: boolean) => {
            if (visible) return;

            void closeOverlayToEvent();
        }
    });

    const showChatDialogState = computed({
        get: () => routeAction.value === 'chat' && selectedEventId.value !== null,
        set: (visible: boolean) => {
            if (visible) return;

            void closeOverlayToEvent();
        }
    });

    const showAuditLogDialogState = computed({
        get: () => routeAction.value === 'audit-log' && selectedEventId.value !== null,
        set: (visible: boolean) => {
            if (visible) return;

            void closeAuditLogDialog();
        }
    });

    const openViewEvent = (eventOrId: number | Event) => {
        const eventId = typeof eventOrId === 'number' ? eventOrId : eventOrId.id;

        if (selectedEventId.value === eventId && routeAction.value === null) {
            return;
        }

        void router.push({ path: `${eventPathPrefix.value}/${eventId}` });
    };

    const openAuditLogEvent = (eventOrId: number | Event) => {
        const eventId = typeof eventOrId === 'number' ? eventOrId : eventOrId.id;

        if (selectedEventId.value === eventId && routeAction.value === 'audit-log') {
            return;
        }

        void router.push({ path: `${eventPathPrefix.value}/${eventId}/audit-log` });
    };

    const handleEditEvent = (event: Event) => {
        void router.push({ path: `${eventPathPrefix.value}/${event.id}/edit` });
    };

    const handleDeleteEvent = async (id: number) => {
        confirm.require({
            header: 'Delete this event?',
            message: "It disappears for everyone who was invited, chat included. This can't be undone.",
            rejectProps: { label: 'Cancel', severity: 'secondary', text: true },
            acceptProps: { label: 'Delete', severity: 'danger' },
            accept: async () => {
                const success = await eventsStore.deleteEvent(id);
                if (success) {
                    toast.add({ severity: 'success', summary: 'Event deleted', life: 2500 });
                    showViewDialogState.value = false;
                }
            }
        });
    };

    watch(
        [selectedEventId, routeAction, selectedEvent],
        ([eventId, action, event]) => {
            if (action !== 'audit-log') {
                navigationError.value = null;
            }

            if (eventId === null) {
                if (externalEvent) {
                    externalEvent.value = null;
                }
                eventToEdit.value = null;
                return;
            }

            if (action === 'edit' && event) {
                eventToEdit.value = JSON.parse(JSON.stringify(event));
            } else if (action !== 'edit') {
                eventToEdit.value = null;
            }
        },
        { immediate: true }
    );

    watch(
        selectedEventId,
        async (eventId) => {
            if (eventId === null) {
                if (externalEvent) {
                    externalEvent.value = null;
                }
                eventToEdit.value = null;
                return;
            }

            if (selectedEvent.value) {
                return;
            }

            const loaded = await eventsStore.fetchEventById(eventId);
            if (!loaded) {
                const status = eventsStore.lastErrorStatus;
                if (status === 403) {
                    void router.replace({ name: 'forbidden' });
                    return;
                }

                if (status === 404 || routeAction.value === 'audit-log') {
                    void router.replace({ name: 'not-found' });
                    return;
                }

                void closeEventState();
                return;
            }

            if (externalEvent) {
                externalEvent.value =
                    events.value.find((event) => event.id === eventId) ||
                    eventsStore.events.find((event) => event.id === eventId) ||
                    null;
            }
        },
        { immediate: true }
    );

    return {
        selectedEventId,
        showViewDialog: showViewDialogState,
        showEditDialog: showEditDialogState,
        showChatDialog: showChatDialogState,
        showAuditLogDialog: showAuditLogDialogState,
        eventToEdit,
        selectedEvent,
        openViewEvent,
        openAuditLogEvent,
        handleEditEvent,
        handleDeleteEvent,
        navigationError
    };
}
