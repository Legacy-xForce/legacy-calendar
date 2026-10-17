<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Event, EventParticipant } from '../../../types/Event';
import UserAvatar from '../../UserAvatar.vue';
import { injectEventView } from '../../../composables/useEventView';

defineProps<{
    event: Event;
}>();

const {
    drivers,
    needsRide,
    selfTransport,
    resolvedInvitees,
    dragOverDriverId,
    isHost,
    isEnded,
    isAldoMoro,
    getAvailableSeats,
    currentUser
} = injectEventView();

const canEditRides = computed(
    () => (isHost.value || drivers.value.some((driver) => driver.id === currentUser.value?.id)) && !isEnded.value
);

const canEditRide = (driverId: number) => {
    return (isHost.value || driverId === currentUser.value?.id) && !isEnded.value;
};

const emit = defineEmits<{
    (e: 'drag-start', event: DragEvent, passengerId: number): void;
    (e: 'drag-over', event: DragEvent, driverId: number): void;
    (e: 'drag-leave'): void;
    (e: 'drop', event: DragEvent, driverId: number): void;
    (e: 'assign-ride', passengerId: number, driverId: number | null): void;
    (e: 'assign-rides-batch', passengerIds: number[], driverId: number | null): void;
}>();

const selectedPassengerIds = ref<number[]>([]);

const passengersMap = computed(() => {
    const map: Record<number, EventParticipant[]> = {};
    resolvedInvitees.value.forEach((p) => {
        if (p.driver?.id) {
            if (!map[p.driver.id]) map[p.driver.id] = [];
            map[p.driver.id].push(p);
        }
    });
    return map;
});

const getPassengersForDriver = (driverId: number) => passengersMap.value[driverId] || [];

const hasAnyone = computed(() => drivers.value.length + needsRide.value.length + selfTransport.value.length > 0);

const togglePassengerSelection = (passengerId: number) => {
    if (!canEditRides.value) return;

    const index = selectedPassengerIds.value.indexOf(passengerId);
    if (index === -1) {
        selectedPassengerIds.value.push(passengerId);
    } else {
        selectedPassengerIds.value.splice(index, 1);
    }
};

const handleDriverClick = (driverId: number) => {
    if (!canEditRides.value || !canEditRide(driverId)) return;
    if (selectedPassengerIds.value.length === 0) return;

    const driver = drivers.value.find((d) => d.id === driverId);
    const availableSeats = getAvailableSeats(driver);

    if (selectedPassengerIds.value.length <= availableSeats) {
        emit('assign-rides-batch', [...selectedPassengerIds.value], driverId);
        selectedPassengerIds.value = [];
    }
};

const canAssignToDriver = (driverId: number) => {
    if (selectedPassengerIds.value.length === 0) return false;
    const driver = drivers.value.find((d) => d.id === driverId);
    return selectedPassengerIds.value.length <= getAvailableSeats(driver);
};

const driverCardClass = (driverId: number, seatsLeft: number) => {
    if (dragOverDriverId.value === driverId) {
        return seatsLeft === 0 || !canEditRide(driverId)
            ? 'border-rose-400/50 bg-rose-400/8'
            : 'border-emerald-400/50 bg-emerald-400/8';
    }
    if (selectedPassengerIds.value.length && canEditRide(driverId)) {
        return canAssignToDriver(driverId)
            ? 'border-emerald-400/40 bg-raised cursor-pointer hover:bg-emerald-400/8'
            : 'border-line bg-raised opacity-60';
    }
    return 'border-line bg-raised';
};
</script>

<template>
    <section v-if="hasAnyone" class="flex flex-col gap-2">
        <div class="flex items-baseline justify-between gap-3">
            <h3 class="eyebrow m-0">Rides</h3>
            <span v-if="needsRide.length" class="text-meta tabular text-amber-200">
                {{ needsRide.length }} {{ needsRide.length === 1 ? 'needs' : 'need' }} a ride
            </span>
            <span v-else class="text-meta text-muted">Everyone is sorted</span>
        </div>

        <div
            v-if="isAldoMoro"
            class="flex items-center gap-3 rounded-2xl border border-rose-400/20 bg-rose-400/8 px-4 py-3 text-rose-300"
        >
            <i class="pi pi-exclamation-triangle"></i>
            <div>
                <p class="text-body m-0 font-semibold">Aldo Moro detected</p>
                <p class="text-meta m-0 text-rose-300/80">Not enough seats for everyone who needs a ride.</p>
            </div>
        </div>

        <div v-if="drivers.length" class="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div
                v-for="driver in drivers"
                :key="driver.id"
                class="flex flex-col gap-3 rounded-2xl border p-3.5 transition-colors duration-150"
                :class="driverCardClass(driver.id, getAvailableSeats(driver))"
                @dragover="emit('drag-over', $event, driver.id)"
                @dragleave="emit('drag-leave')"
                @drop="emit('drop', $event, driver.id)"
                @click="handleDriverClick(driver.id)"
            >
                <div class="flex items-center gap-3">
                    <UserAvatar :profilePictureUrl="driver.profilePictureUrl" :username="driver.username" />
                    <div class="min-w-0 flex-1">
                        <p class="text-body text-fg m-0 truncate font-medium">{{ driver.username }}</p>
                        <p
                            class="text-meta tabular m-0"
                            :class="getAvailableSeats(driver) > 0 ? 'text-muted' : 'text-rose-300'"
                        >
                            <i class="pi pi-car mr-1 text-[0.6875rem]"></i>
                            {{
                                getAvailableSeats(driver) > 0
                                    ? `${getAvailableSeats(driver)} of ${(driver.vehicleSeats ?? 1) - 1} seats free`
                                    : 'Full'
                            }}
                        </p>
                    </div>
                    <span
                        v-if="selectedPassengerIds.length > 0 && canEditRide(driver.id)"
                        class="animate-pop-in rounded-full px-2.5 py-1 text-[0.75rem] font-semibold"
                        :class="
                            canAssignToDriver(driver.id)
                                ? 'bg-accent text-primary-contrast'
                                : 'bg-surface-850 text-subtle'
                        "
                    >
                        {{ canAssignToDriver(driver.id) ? `Add ${selectedPassengerIds.length}` : 'No room' }}
                    </span>
                </div>

                <div class="flex flex-wrap gap-1.5">
                    <span
                        v-for="passenger in getPassengersForDriver(driver.id)"
                        :key="passenger.id"
                        class="bg-surface-900 text-meta text-fg flex items-center gap-1.5 rounded-full py-0.5 pl-0.5"
                        :class="canEditRide(driver.id) ? 'pr-0.5' : 'pr-2.5'"
                    >
                        <UserAvatar
                            :profilePictureUrl="passenger.profilePictureUrl"
                            :username="passenger.username"
                            class="size-6! text-[0.625rem]!"
                        />
                        {{ passenger.username }}
                        <button
                            v-if="canEditRide(driver.id)"
                            type="button"
                            class="text-subtle hover:bg-surface-800 hover:text-fg flex size-6 items-center justify-center rounded-full"
                            :aria-label="`Remove ${passenger.username} from this car`"
                            @click.stop="emit('assign-ride', passenger.id, null)"
                        >
                            <i class="pi pi-times text-[0.5625rem]"></i>
                        </button>
                    </span>
                    <span v-if="getPassengersForDriver(driver.id).length === 0" class="text-meta text-subtle">
                        No passengers yet
                    </span>
                </div>
            </div>
        </div>

        <div v-if="needsRide.length" class="flex flex-col gap-2 pt-2">
            <div class="flex items-center justify-between gap-3">
                <span class="text-meta text-muted font-medium">
                    {{ canEditRides && drivers.length ? 'Tap people, then tap a car' : 'Needs a ride' }}
                </span>
                <button
                    v-if="selectedPassengerIds.length > 0"
                    type="button"
                    class="text-meta text-muted hover:text-fg font-medium"
                    @click="selectedPassengerIds = []"
                >
                    Clear ({{ selectedPassengerIds.length }})
                </button>
            </div>
            <div class="flex flex-wrap gap-1.5">
                <button
                    v-for="passenger in needsRide"
                    :key="passenger.id"
                    type="button"
                    :draggable="canEditRides"
                    :disabled="!canEditRides"
                    class="pressable text-meta flex items-center gap-1.5 rounded-full border py-0.5 pr-3 pl-0.5 disabled:cursor-default"
                    :class="
                        selectedPassengerIds.includes(passenger.id)
                            ? 'border-emerald-400/60 bg-emerald-400/12 text-emerald-200'
                            : 'border-line bg-surface-900 text-fg'
                    "
                    :aria-pressed="selectedPassengerIds.includes(passenger.id)"
                    @dragstart="emit('drag-start', $event, passenger.id)"
                    @click="togglePassengerSelection(passenger.id)"
                >
                    <UserAvatar
                        :profilePictureUrl="passenger.profilePictureUrl"
                        :username="passenger.username"
                        class="size-6! text-[0.625rem]!"
                    />
                    {{ passenger.username }}
                    <i v-if="selectedPassengerIds.includes(passenger.id)" class="pi pi-check text-[0.625rem]"></i>
                </button>
            </div>
        </div>

        <div v-if="selfTransport.length" class="flex flex-col gap-2 pt-2">
            <span class="text-meta text-muted font-medium">Getting there on their own</span>
            <div class="flex flex-wrap gap-1.5">
                <span
                    v-for="person in selfTransport"
                    :key="person.id"
                    class="bg-surface-900 text-meta text-fg flex items-center gap-1.5 rounded-full py-0.5 pr-3 pl-0.5"
                >
                    <UserAvatar
                        :profilePictureUrl="person.profilePictureUrl"
                        :username="person.username"
                        class="size-6! text-[0.625rem]!"
                    />
                    {{ person.username }}
                </span>
            </div>
        </div>
    </section>
</template>
