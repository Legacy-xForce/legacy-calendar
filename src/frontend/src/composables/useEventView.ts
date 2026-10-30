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
import type { Event, FeatureId, EventParticipant, EventPersonSummary, RideDirection } from '../types/Event';
import { useSessionStore } from '../stores/session';
import { useUsersStore } from '../stores/users';
import {
    canUserRespondToEvent,
    createFeatureRecord,
    featureCount,
    featurePricesFromEvent,
    featureSplitPrice,
    participantFeatures,
    selectedFeaturesFromEvent,
    totalEventBudget,
    openNavigation,
    hasLocalChatAccess,
    hasLocalAuditLogAccess,
    isEventManager
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
    const userById = computed(() => new Map(allUsers.value.map((user) => [user.id, user] as const)));

    const eventHost = computed(() => {
        const event = eventRef.value;
        if (!event) return null;
        if (event.host) return event.host;
        if (event.hostId === undefined || event.hostId === null) return null;
        return userById.value.get(event.hostId) ?? null;
    });

    const resolvedInvitees = computed(() => {
        if (!eventRef.value?.participants?.length) return [];

        return eventRef.value.participants.map((participant) => {
            const user = userById.value.get(participant.id);
            return {
                ...participant,
                username: participant.username || user?.username || `User ${participant.id}`,
                profilePictureUrl: participant.profilePictureUrl || user?.profilePictureUrl
            };
        });
    });

    const acceptedInvitees = computed(() =>
        resolvedInvitees.value
            .filter((participant) => participant.status === 'ACCEPTED')
            .sort((a, b) => a.username.localeCompare(b.username))
    );

    const inviteeById = computed(
        () => new Map(resolvedInvitees.value.map((participant) => [participant.id, participant]))
    );

    const isHost = computed(() => isEventManager(eventRef.value, currentUser.value?.id));

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

    const availableFeatures = computed(() => eventRef.value?.features ?? []);
    const availableFeatureIds = computed(() => selectedFeaturesFromEvent(eventRef.value));
    const featureById = computed(() => new Map(availableFeatures.value.map((feature) => [feature.id, feature])));

    const eventPrices = computed(() => featurePricesFromEvent(eventRef.value));

    const eventSplitPrices = computed(() =>
        createFeatureRecord(availableFeatureIds.value, (feature) =>
            featureSplitPrice(eventRef.value, resolvedInvitees.value, feature)
        )
    );

    const drivers = computed(() =>
        acceptedInvitees.value.filter((participant) => participant.transportMode === 'DRIVER')
    );
    const driverById = computed(() => new Map(drivers.value.map((driver) => [driver.id, driver] as const)));

    const hasSplitSeats = (driver: EventParticipant) =>
        (driver.vehicleSeatsOutbound || driver.vehicleSeats) !== (driver.vehicleSeatsReturn || driver.vehicleSeats);

    const getPassengerDriverId = (participant: EventParticipant, direction: RideDirection) => {
        const outboundDriverId = participant.driverId;
        if (direction === 'OUTBOUND') return outboundDriverId;
        if (participant.driverIdReturn) return participant.driverIdReturn;
        // Drivers who did not split their trips bring their outbound passengers back too
        const outboundDriver = outboundDriverId === undefined ? undefined : driverById.value.get(outboundDriverId);
        return outboundDriver && !hasSplitSeats(outboundDriver) ? outboundDriverId : undefined;
    };

    const assignedPassengersByDriver = computed(() => {
        const byDirection: Record<RideDirection, Map<number, EventParticipant[]>> = {
            OUTBOUND: new Map(),
            RETURN: new Map()
        };

        for (const participant of resolvedInvitees.value) {
            for (const direction of ['OUTBOUND', 'RETURN'] as const) {
                const driverId = getPassengerDriverId(participant, direction);
                if (driverId === undefined) continue;

                const passengers = byDirection[direction].get(driverId) ?? [];
                passengers.push(participant);
                byDirection[direction].set(driverId, passengers);
            }
        }

        return byDirection;
    });

    const needsRide = computed(() =>
        acceptedInvitees.value.filter(
            (participant) =>
                participant.transportMode === 'NEEDS_RIDE' && !getPassengerDriverId(participant, 'OUTBOUND')
        )
    );

    const getNeedsRide = (direction: RideDirection) =>
        acceptedInvitees.value.filter(
            (participant) => participant.transportMode === 'NEEDS_RIDE' && !getPassengerDriverId(participant, direction)
        );

    const selfTransport = computed(() =>
        acceptedInvitees.value.filter((participant) => participant.transportMode === 'SELF')
    );

    const eventTotalBudget = computed(() => totalEventBudget(eventRef.value));

    const paidAmount = computed(() =>
        resolvedInvitees.value
            .filter((participant) => participant.status === 'ACCEPTED' && participant.hasPaid === true)
            .reduce(
                (total, participant) =>
                    total +
                    participantFeatures(participant).reduce(
                        (sum, feature) => sum + featureSplitPrice(eventRef.value, resolvedInvitees.value, feature),
                        0
                    ),
                0
            )
    );

    const unpaidAmount = computed(() => Math.max(0, eventTotalBudget.value - paidAmount.value));

    const getFeatureCount = (feature: FeatureId) => featureCount(resolvedInvitees.value, feature);

    const getFeatureSplitPrice = (feature: FeatureId) =>
        featureSplitPrice(eventRef.value, resolvedInvitees.value, feature);

    const userTotalShare = computed(() => {
        const user = currentUser.value;
        if (!user || !eventRef.value) return 0;

        const participant = eventRef.value.participants?.find((item) => item.id === user.id);
        if (!participant || participant.status !== 'ACCEPTED') return 0;

        return participantFeatures(participant).reduce((total, feature) => total + getFeatureSplitPrice(feature), 0);
    });

    const getAssignedPassengers = (driverId: number, direction: RideDirection = 'OUTBOUND') => {
        return assignedPassengersByDriver.value[direction].get(driverId) ?? [];
    };

    const getAvailableSeats = (driver: EventParticipant | undefined, direction: RideDirection = 'OUTBOUND') => {
        if (!driver) return 0;
        const assigned = getAssignedPassengers(driver.id, direction).length;
        const totalSeats =
            direction === 'RETURN'
                ? (driver.vehicleSeatsReturn ?? driver.vehicleSeats ?? 0)
                : (driver.vehicleSeatsOutbound ?? driver.vehicleSeats ?? 0);
        // -1 for the driver themselves usually? The original code had: Math.max(0, totalSeats! - 1 - assigned);
        return Math.max(0, totalSeats - 1 - assigned);
    };

    const isAldoMoro = computed(() => {
        if (!eventRef.value?.participants) return false;

        const rideNeedingParticipants = needsRide.value;
        if (rideNeedingParticipants.length === 0) return false;

        const totalSeats = drivers.value.reduce(
            (acc, participant) =>
                acc + Math.max(0, (participant.vehicleSeatsOutbound ?? participant.vehicleSeats ?? 0) - 1),
            0
        );
        return totalSeats < rideNeedingParticipants.length;
    });

    const getParticipantFeatures = (userId: number): FeatureId[] => {
        return participantFeatures(inviteeById.value.get(userId));
    };

    const resolvedCoHosts = computed(() =>
        (eventRef.value?.coHosts ?? []).map((coHost) => {
            if (coHost.username && coHost.profilePictureUrl !== undefined) return coHost;
            const user = userById.value.get(coHost.id);
            return {
                ...coHost,
                username: coHost.username || user?.username || `User ${coHost.id}`,
                profilePictureUrl: coHost.profilePictureUrl ?? user?.profilePictureUrl
            };
        })
    );

    const allEventHosts = computed(() => {
        const hosts: EventPersonSummary[] = [];
        if (eventHost.value) {
            hosts.push(eventHost.value);
        }
        for (const coHost of resolvedCoHosts.value) {
            if (!hosts.some((h) => h.id === coHost.id)) {
                hosts.push(coHost);
            }
        }
        return hosts;
    });

    const hostedByText = computed(() => {
        if (allEventHosts.value.length === 0) return '';
        return allEventHosts.value.map((h) => h.username).join(', ');
    });

    return {
        // State
        isGuestMode,
        currentUser,
        coHosts: resolvedCoHosts,
        allEventHosts,
        hostedByText,
        selfTransport,
        resolvedInvitees,
        isHost,
        userParticipantStatus,
        isDeadlinePassed,
        isEnded,
        canAccept,
        canAccessChat,
        canAccessAuditLog,
        availableFeatures,
        availableFeatureIds,
        featureById,
        eventPrices,
        eventSplitPrices,
        drivers,
        getNeedsRide,
        eventTotalBudget,
        paidAmount,
        unpaidAmount,
        userTotalShare,
        isAldoMoro,
        dragOverDriverId,

        // Utils
        getFeatureCount,
        getFeatureSplitPrice,
        getAvailableSeats,
        getAssignedPassengers,
        hasSplitSeats,
        getParticipantFeatures,
        openNavigation,

        // Actions
        fetchUsers: () => (isGuestMode ? Promise.resolve() : usersStore.fetchUsers())
    };
}
