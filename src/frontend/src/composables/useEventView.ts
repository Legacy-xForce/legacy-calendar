import { computed, ref, watch, type Ref, type InjectionKey, inject } from 'vue';
import { storeToRefs } from 'pinia';
import api from '../services/API';

export type EventViewContext = ReturnType<typeof useEventView>;
export const EventViewInjectionKey: InjectionKey<EventViewContext> = Symbol('EventView');

export function injectEventView() {
    const context = inject(EventViewInjectionKey);
    if (!context) {
        throw new Error('useEventView must be used within a component that provides EventViewInjectionKey');
    }
    return context;
}
import type { Event, EventFeature, EventParticipant } from '../types/Event';
import { useSessionStore } from '../stores/session';
import { useUsersStore } from '../stores/users';
import { FEATURES } from '../constants/features';
import {
    canUserRespondToEvent,
    createFeatureRecord,
    featureCount,
    featurePricesFromEvent,
    featureSplitPrice,
    getParticipantStatusIcon,
    getParticipantStatusSeverity,
    participantFeatures,
    selectedFeaturesFromEvent,
    totalEventBudget,
    openNavigation,
    hasLocalChatAccess,
    hasLocalAuditLogAccess
} from '../utils/event';

// Shared state for drag highlighting (Choice A)
const dragOverDriverId = ref<number | null>(null);

export function useChatAccess(eventRef: Ref<Event | null>) {
    const sessionStore = useSessionStore();
    const canAccessChat = ref(false);
    const isChatAccessChecking = ref(true);
    const accessCheckKey = ref(0);

    watch(
        [eventRef, () => sessionStore.currentUser?.id],
        async ([event, currentUserId]) => {
            accessCheckKey.value += 1;
            const checkId = accessCheckKey.value;

            if (!event || currentUserId == null) {
                canAccessChat.value = false;
                isChatAccessChecking.value = true;
                return;
            }

            isChatAccessChecking.value = true;

            if (!hasLocalChatAccess(event, currentUserId)) {
                canAccessChat.value = false;
                isChatAccessChecking.value = false;
                return;
            }

            try {
                await api.getChatHistory(event.id, undefined, 1);
                if (accessCheckKey.value === checkId) {
                    canAccessChat.value = true;
                    isChatAccessChecking.value = false;
                }
            } catch {
                if (accessCheckKey.value === checkId) {
                    canAccessChat.value = false;
                    isChatAccessChecking.value = false;
                }
            }
        },
        { immediate: true }
    );

    return {
        canAccessChat,
        isChatAccessChecking
    };
}

export interface UseEventViewOptions {
    // When set, used instead of the authenticated session's user - lets a guest
    // (no session, no JWT) reuse this composable and the components built on it.
    currentUser?: Ref<{ id: number; username: string; isAdmin: boolean } | null | undefined>;
    // Guests have no JWT, so chat/audit-log access checks and the full users
    // list (both JWT-gated endpoints) must be skipped rather than attempted.
    guestMode?: boolean;
}

export function useEventView(eventRef: Ref<Event | null>, options: UseEventViewOptions = {}) {
    const isGuestMode = options.guestMode ?? false;
    const sessionStore = useSessionStore();
    const usersStore = useUsersStore();
    const { users: allUsers } = storeToRefs(usersStore);

    const currentUser = options.currentUser ?? computed(() => sessionStore.currentUser);

    const eventHost = computed(() => {
        const event = eventRef.value;
        if (!event) return null;
        if (event.host) return event.host;
        if (event.hostId === undefined || event.hostId === null || allUsers.value.length === 0) return null;
        return allUsers.value.find((user) => user.id === event.hostId) || null;
    });

    const resolvedInvitees = computed(() => {
        if (!eventRef.value?.participants?.length) return [];

        return eventRef.value.participants.map((participant) => {
            const user = allUsers.value.find((u) => u.id === participant.id);
            return {
                ...participant,
                username: participant.username || user?.username || `User ${participant.id}`,
                profilePictureUrl: participant.profilePictureUrl || user?.profilePictureUrl
            };
        });
    });

    const isHost = computed(() => {
        const user = currentUser.value;
        if (!user || !eventRef.value) return false;
        return (
            eventRef.value.host?.id === user.id ||
            eventRef.value.hostId === user.id ||
            (eventRef.value.coHosts?.some((coHost) => coHost.id === user.id) ?? false)
        );
    });

    const userParticipantStatus = computed(() => {
        if (!currentUser.value || !eventRef.value?.participants) return null;
        return (
            eventRef.value.participants.find((participant) => participant.id === currentUser.value?.id)?.status ?? null
        );
    });

    const isDeadlinePassed = computed(() => {
        if (!eventRef.value?.participationDeadline) return false;
        return new Date() > new Date(eventRef.value.participationDeadline);
    });

    const isEnded = computed(() => {
        if (!eventRef.value?.endTime) return false;
        return new Date() > new Date(eventRef.value.endTime);
    });

    const canAccept = computed(() => {
        if (!eventRef.value || !currentUser.value || isEnded.value) return false;
        if (isDeadlinePassed.value && !isHost.value) return false;
        return canUserRespondToEvent({
            isHost: isHost.value,
            userParticipantStatus: userParticipantStatus.value,
            isOpen: eventRef.value.isOpen
        });
    });

    const { canAccessChat } = isGuestMode ? { canAccessChat: ref(false) } : useChatAccess(eventRef);
    const canAccessAuditLog = computed(
        () => !isGuestMode && hasLocalAuditLogAccess(eventRef.value, currentUser.value?.id)
    );

    const availableFeatureIds = computed(() => selectedFeaturesFromEvent(eventRef.value));

    const eventPrices = computed(() => featurePricesFromEvent(eventRef.value));

    const eventSplitPrices = computed(() =>
        createFeatureRecord((feature) => featureSplitPrice(eventRef.value, resolvedInvitees.value, feature))
    );

    const featuresListColumns = computed(() =>
        FEATURES.filter((feature) => availableFeatureIds.value.includes(feature.id)).map((feature) => ({
            field: feature.id,
            header: feature.label,
            icon: feature.icon
        }))
    );

    const drivers = computed(() => {
        if (!eventRef.value?.participants) return [];
        return resolvedInvitees.value
            .filter((participant) => participant.status === 'ACCEPTED' && participant.transportMode === 'DRIVER')
            .sort((a, b) => a.username.localeCompare(b.username));
    });

    const needsRide = computed(() => {
        if (!eventRef.value?.participants) return [];
        return resolvedInvitees.value
            .filter(
                (participant) =>
                    participant.status === 'ACCEPTED' &&
                    participant.transportMode === 'NEEDS_RIDE' &&
                    !participant.driverId
            )
            .sort((a, b) => a.username.localeCompare(b.username));
    });

    const selfTransport = computed(() => {
        if (!eventRef.value?.participants) return [];
        return resolvedInvitees.value
            .filter((participant) => participant.status === 'ACCEPTED' && participant.transportMode === 'SELF')
            .sort((a, b) => a.username.localeCompare(b.username));
    });

    const eventTotalBudget = computed(() => totalEventBudget(eventRef.value));

    const getFeatureCount = (feature: EventFeature) => featureCount(resolvedInvitees.value, feature);

    const getFeatureSplitPrice = (feature: EventFeature) =>
        featureSplitPrice(eventRef.value, resolvedInvitees.value, feature);

    const hasFeature = (userId: number, feature: EventFeature) => {
        const participant = resolvedInvitees.value.find((p) => p.id === userId);
        return participantFeatures(participant).includes(feature);
    };

    const userTotalShare = computed(() => {
        const user = currentUser.value;
        if (!user || !eventRef.value) return 0;

        const participant = eventRef.value.participants?.find((item) => item.id === user.id);
        if (!participant || participant.status !== 'ACCEPTED') return 0;

        return participantFeatures(participant).reduce((total, feature) => total + getFeatureSplitPrice(feature), 0);
    });

    const getAssignedPassengers = (driverId: number) => {
        return resolvedInvitees.value.filter(
            (participant) => participant.driverId === driverId || participant.driver?.id === driverId
        );
    };

    const getAvailableSeats = (driver: EventParticipant | undefined) => {
        if (!driver) return 0;
        const assigned = getAssignedPassengers(driver.id).length;
        const totalSeats = driver.vehicleSeats || 0;
        // -1 for the driver themselves usually? The original code had: Math.max(0, totalSeats! - 1 - assigned);
        return Math.max(0, totalSeats - 1 - assigned);
    };

    const isAldoMoro = computed(() => {
        if (!eventRef.value?.participants) return false;

        const rideNeedingParticipants = needsRide.value;
        if (rideNeedingParticipants.length === 0) return false;

        const totalSeats = drivers.value.reduce(
            (acc, participant) => acc + Math.max(0, (participant.vehicleSeats || 0) - 1),
            0
        );
        return totalSeats < rideNeedingParticipants.length;
    });

    const getParticipantFeatures = (userId: number): EventFeature[] => {
        return participantFeatures(resolvedInvitees.value.find((participant) => participant.id === userId));
    };

    return {
        // State
        currentUser,
        eventHost,
        coHosts: computed(() =>
            (eventRef.value?.coHosts ?? []).map((coHost) => {
                if (coHost.username && coHost.profilePictureUrl !== undefined) return coHost;
                const user = allUsers.value.find((u) => u.id === coHost.id);
                return {
                    ...coHost,
                    username: coHost.username || user?.username || `User ${coHost.id}`,
                    profilePictureUrl: coHost.profilePictureUrl ?? user?.profilePictureUrl
                };
            })
        ),
        selfTransport,
        resolvedInvitees,
        isHost,
        userParticipantStatus,
        isDeadlinePassed,
        isEnded,
        canAccept,
        canAccessChat,
        canAccessAuditLog,
        availableFeatureIds,
        eventPrices,
        eventSplitPrices,
        featuresListColumns,
        drivers,
        needsRide,
        eventTotalBudget,
        userTotalShare,
        isAldoMoro,
        dragOverDriverId,

        // Utils
        getFeatureCount,
        getFeatureSplitPrice,
        hasFeature,
        getAvailableSeats,
        getParticipantFeatures,
        getStatusIcon: getParticipantStatusIcon,
        getStatusSeverity: getParticipantStatusSeverity,
        openNavigation,

        // Actions
        fetchUsers: () => (isGuestMode ? Promise.resolve() : usersStore.fetchUsers())
    };
}
