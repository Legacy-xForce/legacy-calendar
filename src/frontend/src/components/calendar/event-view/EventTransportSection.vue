<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Event, EventParticipant } from '../../../types/Event';
import Tag from 'primevue/tag';
import Button from 'primevue/button';
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
</script>

<template>
    <div class="flex flex-col gap-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="text-surface-600 dark:text-surface-400 flex items-center gap-2">
                <i class="pi pi-car"></i>
                <span class="text-sm font-semibold tracking-wider uppercase">Transport & Rides</span>
            </div>

            <Tag v-if="needsRide.length > 0" severity="warn" :value="`${needsRide.length} needing ride`" size="small" />
        </div>

        <div v-if="drivers.length > 0" class="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div
                v-for="driver in drivers"
                :key="driver.id"
                class="flex flex-col gap-3 rounded-2xl border p-4 transition-all duration-200"
                :class="[
                    dragOverDriverId === driver.id
                        ? 'scale-[1.02] border-emerald-500 bg-emerald-500/10 shadow-lg shadow-emerald-500/10'
                        : 'border-zinc-200 bg-zinc-50/50 dark:border-zinc-800 dark:bg-zinc-900/50',
                    dragOverDriverId === driver.id && (getAvailableSeats(driver) === 0 || !canEditRide(driver.id))
                        ? 'border-red-500 bg-red-500/10'
                        : ''
                ]"
                @dragover="emit('drag-over', $event, driver.id)"
                @dragleave="emit('drag-leave')"
                @drop="emit('drop', $event, driver.id)"
                @click="handleDriverClick(driver.id)"
            >
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <UserAvatar :profilePictureUrl="driver.profilePictureUrl" :username="driver.username" />
                        <div class="flex flex-col">
                            <span class="text-sm font-bold">{{ driver.username }}</span>
                            <div class="flex items-center gap-2 text-[10px] font-bold uppercase">
                                <span>
                                    {{ driver.vehicleSeats }} total seat{{ driver.vehicleSeats !== 1 ? 's' : '' }}
                                </span>
                                <span class="font-black">·</span>
                                <span :class="getAvailableSeats(driver) > 0 ? 'text-emerald-500' : 'text-red-500'">
                                    {{ getAvailableSeats(driver) > 0 ? getAvailableSeats(driver) + ' left' : 'Full' }}
                                </span>
                            </div>
                        </div>
                    </div>
                    <div
                        v-if="selectedPassengerIds.length > 0 && canEditRide(driver.id)"
                        class="animate-in fade-in zoom-in duration-300"
                    >
                        <Tag
                            :severity="canAssignToDriver(driver.id) ? 'success' : 'danger'"
                            :value="canAssignToDriver(driver.id) ? `Assign ${selectedPassengerIds.length}` : 'Too many'"
                            size="small"
                            class="cursor-pointer"
                        />
                    </div>
                </div>

                <div class="flex flex-wrap gap-2 pt-1">
                    <div
                        v-for="passenger in getPassengersForDriver(driver.id)"
                        :key="passenger.id"
                        class="group flex items-center gap-2 rounded-lg border border-zinc-300/30 bg-zinc-200/50 px-2 py-1 dark:border-zinc-700/30 dark:bg-zinc-800/50"
                    >
                        <UserAvatar
                            :profilePictureUrl="passenger.profilePictureUrl"
                            :username="passenger.username"
                            class="h-4! w-4!"
                        />
                        <span class="text-[10px] font-medium">{{ passenger.username }}</span>
                        <Button
                            v-if="canEditRide(driver.id)"
                            icon="pi pi-times"
                            severity="danger"
                            text
                            class="size-3.5! p-0!"
                            @click.stop="emit('assign-ride', passenger.id, null)"
                        />
                    </div>
                    <div
                        v-if="getPassengersForDriver(driver.id).length === 0"
                        class="px-1 text-[10px] text-zinc-500 italic"
                    >
                        No passengers assigned yet
                    </div>
                </div>
            </div>
        </div>
        <div
            v-else
            class="rounded-2xl border border-dashed border-zinc-200 p-8 text-center text-sm text-zinc-500 dark:border-zinc-800"
        >
            No drivers available for this event yet.
        </div>

        <div class="mt-2 flex flex-col gap-2">
            <div class="flex items-center justify-between px-1">
                <span class="text-[10px] font-black tracking-widest text-zinc-400 uppercase">
                    Unassigned Participants
                </span>
                <button
                    v-if="selectedPassengerIds.length > 0"
                    @click="selectedPassengerIds = []"
                    class="text-[9px] font-bold tracking-widest text-zinc-500 uppercase underline focus:outline-none"
                >
                    Clear Selection ({{ selectedPassengerIds.length }})
                </button>
            </div>
            <div
                v-if="needsRide.length === 0"
                class="rounded-2xl border border-dashed border-zinc-200 p-8 text-center text-sm text-zinc-500 dark:border-zinc-800"
            >
                Everyone has a ride
            </div>
            <div v-else class="flex flex-col gap-1">
                <div
                    v-for="passenger in needsRide"
                    :key="passenger.id"
                    :draggable="canEditRides"
                    @dragstart="emit('drag-start', $event, passenger.id)"
                    @click="togglePassengerSelection(passenger.id)"
                    class="group flex items-center justify-between rounded-xl border p-3 transition-all duration-300"
                    :class="[
                        selectedPassengerIds.includes(passenger.id)
                            ? 'border-emerald-500 bg-emerald-500/10 shadow-sm'
                            : 'border-zinc-100 bg-white dark:border-zinc-800/50 dark:bg-zinc-900/30',
                        canEditRides ? 'cursor-pointer hover:border-emerald-500/50' : 'cursor-default'
                    ]"
                >
                    <div class="flex items-center gap-3">
                        <UserAvatar
                            :profilePictureUrl="passenger.profilePictureUrl"
                            :username="passenger.username"
                            :class="{ 'ring-2 ring-emerald-500': selectedPassengerIds.includes(passenger.id) }"
                        />
                        <div class="relative my-auto flex flex-col">
                            <div
                                class="text-sm leading-none font-medium transition-transform duration-300"
                                :class="[canEditRides ? 'group-hover:-translate-y-1' : '']"
                            >
                                {{ passenger.username }}
                            </div>
                            <div
                                class="absolute top-2 left-0 text-[9px] font-bold tracking-tighter whitespace-nowrap text-zinc-500 uppercase opacity-0 transition-all duration-300"
                                :class="[
                                    canEditRides && !selectedPassengerIds.includes(passenger.id)
                                        ? 'group-hover:translate-y-1 group-hover:opacity-100'
                                        : ''
                                ]"
                            >
                                Drag to assign or tap to select
                            </div>
                            <div
                                v-if="selectedPassengerIds.includes(passenger.id)"
                                class="text-[9px] font-black tracking-widest text-emerald-500 uppercase"
                            >
                                Selected
                            </div>
                        </div>
                    </div>
                    <div v-if="selectedPassengerIds.includes(passenger.id)" class="text-emerald-500">
                        <i class="pi pi-check-circle text-lg"></i>
                    </div>
                </div>
            </div>
        </div>

        <div
            v-if="isAldoMoro"
            class="mt-4 flex items-center gap-3 rounded-xl border border-red-500/20 bg-red-500/5 p-3 text-red-500"
        >
            <i class="pi pi-exclamation-triangle text-lg"></i>
            <span class="animate-pulse text-xs font-bold tracking-widest uppercase">Aldo moro detected</span>
        </div>

        <!-- People going by themselves -->
        <div v-if="selfTransport.length > 0" class="mt-2 flex flex-col gap-2">
            <div class="flex items-center justify-between px-1">
                <span class="text-[10px] font-black tracking-widest text-zinc-400 uppercase">
                    Going by themselves ({{ selfTransport.length }})
                </span>
            </div>
            <div class="flex flex-col gap-1">
                <div
                    v-for="passenger in selfTransport"
                    :key="passenger.id"
                    class="flex items-center justify-between rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800/50 dark:bg-zinc-900/30"
                >
                    <div class="flex items-center gap-3">
                        <UserAvatar :profilePictureUrl="passenger.profilePictureUrl" :username="passenger.username" />
                        <div class="flex flex-col">
                            <div class="text-sm font-medium">{{ passenger.username }}</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>
