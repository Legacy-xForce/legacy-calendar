<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import ToggleSwitch from 'primevue/toggleswitch';
import SeatStepper from './SeatStepper.vue';
import { type EventFeature, type FeatureSelectionResult, type TransportMode } from '../../types/Event';

import { FEATURES } from '../../constants/features';
import { TRANSPORT_OPTIONS } from '../../constants/transport';
import { toggleFeature as toggleFeatureInSelection } from '../../utils/event';
import { formatCurrency } from '../../utils/format';

const props = defineProps<{
    visible: boolean;
    availableFeatures?: EventFeature[];
    initialFeatures?: EventFeature[];
    submitLabel?: string;
    featurePrices?: Record<EventFeature, number | null>;
    featureSplitPrices?: Record<EventFeature, number | null>;
    /** How many other people (not you) are in for each feature, used to project your share. */
    featureCounts?: Record<EventFeature, number>;
    initialTransportMode?: TransportMode;
    initialVehicleSeats?: number;
    initialVehicleSeatsOutbound?: number;
    initialVehicleSeatsReturn?: number;
}>();

const emit = defineEmits<{
    (e: 'update:visible', value: boolean): void;
    (e: 'confirm', data: FeatureSelectionResult): void;
}>();

const MIN_SEATS = 2;

const selectedFeatures = ref<EventFeature[]>([]);
const transportMode = ref<TransportMode>('NEEDS_RIDE');
// Drivers can offer a different number of seats for the way back
const vehicleSeatsOutbound = ref(MIN_SEATS);
const vehicleSeatsReturn = ref(MIN_SEATS);
const splitTrips = ref(false);
const driverSectionRef = ref<HTMLElement | null>(null);

const atLeastMin = (value: number | undefined, fallback: number) => (value && value >= MIN_SEATS ? value : fallback);

const selectTransportMode = (mode: TransportMode) => {
    transportMode.value = mode;
    if (mode !== 'DRIVER') return;
    if (!splitTrips.value) vehicleSeatsReturn.value = vehicleSeatsOutbound.value;
    void nextTick(() => driverSectionRef.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
};

const onSplitTripsChange = (split: boolean) => {
    if (!split) vehicleSeatsReturn.value = vehicleSeatsOutbound.value;
};

const features = computed(() =>
    props.availableFeatures === undefined
        ? FEATURES
        : FEATURES.filter((feature) => props.availableFeatures!.includes(feature.id))
);

/** Your share if you opt in: the budget split across everyone in, counting you once. */
const projectedShare = (feature: EventFeature) => {
    const price = props.featurePrices?.[feature];
    if (price === null || price === undefined) return null;
    if (!props.featureCounts) return props.featureSplitPrices?.[feature] ?? price;
    return price / ((props.featureCounts[feature] ?? 0) + 1);
};

const totalShare = computed(() =>
    selectedFeatures.value.reduce((total, feature) => total + (projectedShare(feature) ?? 0), 0)
);
const hasBudgets = computed(() => features.value.some((feature) => projectedShare(feature.id) !== null));

const toggleFeature = (feature: EventFeature) => {
    toggleFeatureInSelection(selectedFeatures.value, feature);
};

const onConfirm = () => {
    emit('confirm', {
        features: selectedFeatures.value,
        transport: {
            transportMode: transportMode.value,
            vehicleSeats: transportMode.value === 'DRIVER' ? vehicleSeatsOutbound.value : undefined,
            vehicleSeatsOutbound: transportMode.value === 'DRIVER' ? vehicleSeatsOutbound.value : undefined,
            vehicleSeatsReturn:
                transportMode.value === 'DRIVER'
                    ? splitTrips.value
                        ? vehicleSeatsReturn.value
                        : vehicleSeatsOutbound.value
                    : undefined
        }
    });
};

watch(
    () => props.visible,
    (newVal) => {
        if (newVal) {
            selectedFeatures.value = props.initialFeatures ? [...props.initialFeatures] : [];
            transportMode.value = props.initialTransportMode ?? 'NEEDS_RIDE';
            const seats = atLeastMin(props.initialVehicleSeats, MIN_SEATS);
            vehicleSeatsOutbound.value = atLeastMin(props.initialVehicleSeatsOutbound, seats);
            vehicleSeatsReturn.value = atLeastMin(props.initialVehicleSeatsReturn, vehicleSeatsOutbound.value);
            splitTrips.value = vehicleSeatsOutbound.value !== vehicleSeatsReturn.value;
        }
    }
);
</script>

<template>
    <Dialog
        :visible="visible"
        @update:visible="emit('update:visible', $event)"
        modal
        :header="submitLabel?.toLowerCase() === 'save changes' ? 'Your choices' : 'Join event'"
        :style="{ width: '26rem' }"
        dismissableMask
        :draggable="false"
    >
        <div class="flex flex-col gap-6">
            <section v-if="features.length" class="flex flex-col gap-2">
                <h3 class="eyebrow m-0">What are you in for?</h3>
                <div class="flex flex-col gap-1.5">
                    <button
                        v-for="feature in features"
                        :key="feature.id"
                        type="button"
                        class="pressable flex items-center gap-3 rounded-2xl border px-3 py-2.5 text-left"
                        :class="
                            selectedFeatures.includes(feature.id)
                                ? 'border-emerald-400/50 bg-emerald-400/10'
                                : 'border-line bg-raised hover:border-line-strong'
                        "
                        :aria-pressed="selectedFeatures.includes(feature.id)"
                        @click="toggleFeature(feature.id)"
                    >
                        <span
                            class="font-emoji bg-surface-900 flex size-9 shrink-0 items-center justify-center rounded-xl text-lg"
                        >
                            {{ feature.icon }}
                        </span>
                        <span class="text-body text-fg flex-1 font-medium">{{ feature.label }}</span>
                        <span v-if="projectedShare(feature.id) !== null" class="text-meta text-muted tabular">
                            {{ formatCurrency(projectedShare(feature.id)) }}
                        </span>
                        <span
                            class="flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors"
                            :class="
                                selectedFeatures.includes(feature.id)
                                    ? 'bg-accent text-primary-contrast border-transparent'
                                    : 'border-line-strong'
                            "
                        >
                            <i v-if="selectedFeatures.includes(feature.id)" class="pi pi-check text-[0.5625rem]"></i>
                        </span>
                    </button>
                </div>
            </section>

            <section class="flex flex-col gap-2">
                <h3 class="eyebrow m-0">How are you getting there?</h3>
                <div class="grid grid-cols-3 gap-1.5">
                    <button
                        v-for="option in TRANSPORT_OPTIONS"
                        :key="option.id"
                        type="button"
                        class="pressable flex flex-col items-center gap-1.5 rounded-2xl border px-2 py-3"
                        :class="
                            transportMode === option.id
                                ? 'text-fg border-emerald-400/50 bg-emerald-400/10'
                                : 'border-line bg-raised text-muted hover:border-line-strong'
                        "
                        :aria-pressed="transportMode === option.id"
                        @click="selectTransportMode(option.id)"
                    >
                        <span class="font-emoji text-xl">{{ option.icon }}</span>
                        <span class="text-meta font-medium">{{ option.label }}</span>
                    </button>
                </div>

                <div
                    v-if="transportMode === 'DRIVER'"
                    ref="driverSectionRef"
                    class="border-line bg-raised divide-line animate-rise-in mt-1 divide-y overflow-hidden rounded-2xl border"
                >
                    <SeatStepper
                        v-model="vehicleSeatsOutbound"
                        :label="splitTrips ? 'Seats going' : 'Seats in your car'"
                        @update:model-value="(value) => !splitTrips && (vehicleSeatsReturn = value)"
                    />
                    <label for="split-trips" class="flex cursor-pointer items-center justify-between gap-3 px-4 py-3">
                        <span>
                            <span class="text-body text-fg block font-medium">Different seats coming back</span>
                            <span class="text-meta text-muted block">Set the return trip separately</span>
                        </span>
                        <ToggleSwitch
                            inputId="split-trips"
                            v-model="splitTrips"
                            @update:modelValue="onSplitTripsChange"
                        />
                    </label>
                    <SeatStepper v-if="splitTrips" v-model="vehicleSeatsReturn" label="Seats coming back" />
                </div>
            </section>
        </div>

        <template #footer>
            <div class="flex w-full items-center gap-3">
                <div v-if="hasBudgets" class="min-w-0 flex-1">
                    <p class="text-meta text-muted m-0">Your share</p>
                    <p class="text-title font-display tabular m-0 font-semibold">{{ formatCurrency(totalShare) }}</p>
                </div>
                <Button
                    :label="submitLabel || 'Join event'"
                    icon="pi pi-check"
                    :class="hasBudgets ? '' : 'w-full'"
                    @click="onConfirm"
                />
            </div>
        </template>
    </Dialog>
</template>
