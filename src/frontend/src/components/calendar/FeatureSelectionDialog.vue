<script setup lang="ts">
import { ref, watch } from 'vue';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import Slider from 'primevue/slider';
import Divider from 'primevue/divider';
import { type EventFeature, type TransportMode } from '../../types/Event';

import { FEATURES } from '../../constants/features';
import { TRANSPORT_OPTIONS } from '../../constants/transport';
import { toggleFeature as toggleFeatureInSelection } from '../../utils/event';

const props = defineProps<{
    visible: boolean;
    availableFeatures?: EventFeature[];
    initialFeatures?: EventFeature[];
    submitLabel?: string;
    featurePrices?: Record<EventFeature, number | null>;
    featureSplitPrices?: Record<EventFeature, number | null>;
    initialTransportMode?: TransportMode;
    initialVehicleSeats?: number;
}>();

const emit = defineEmits<{
    (e: 'update:visible', value: boolean): void;
    (
        e: 'confirm',
        data: { features: EventFeature[]; transport: { transportMode: TransportMode; vehicleSeats?: number } }
    ): void;
}>();

const selectedFeatures = ref<EventFeature[]>([]);
const transportMode = ref<TransportMode>('NEEDS_RIDE');
const vehicleSeats = ref(2);

const isFeatureAvailable = (id: EventFeature) => {
    // If availableFeatures is undefined, show all (backward compatibility)
    if (props.availableFeatures === undefined) return true;
    return props.availableFeatures.includes(id);
};

const currency = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

const toggleFeature = (feature: EventFeature) => {
    toggleFeatureInSelection(selectedFeatures.value, feature);
};

const selectTransportMode = (mode: TransportMode) => {
    transportMode.value = mode;
    if (mode === 'DRIVER' && (!vehicleSeats.value || vehicleSeats.value < 2)) {
        vehicleSeats.value = 2;
    }
};

const onConfirm = () => {
    emit('confirm', {
        features: selectedFeatures.value,
        transport: {
            transportMode: transportMode.value,
            vehicleSeats: transportMode.value === 'DRIVER' ? vehicleSeats.value : undefined
        }
    });
};

watch(
    () => props.visible,
    (newVal) => {
        if (newVal) {
            selectedFeatures.value = props.initialFeatures ? [...props.initialFeatures] : [];
            transportMode.value = props.initialTransportMode ?? 'NEEDS_RIDE';
            vehicleSeats.value =
                props.initialVehicleSeats && props.initialVehicleSeats >= 2 ? props.initialVehicleSeats : 2;
        }
    }
);
</script>

<template>
    <Dialog
        :visible="visible"
        @update:visible="emit('update:visible', $event)"
        modal
        header="Join Event"
        :style="{ width: '400px' }"
        :breakpoints="{ '640px': '95vw' }"
        class="p-fluid text-center"
        dismissableMask
        :draggable="false"
    >
        <div class="flex flex-col gap-2 py-4">
            <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <button
                    v-for="feature in FEATURES"
                    :key="feature.id"
                    @click="isFeatureAvailable(feature.id) && toggleFeature(feature.id)"
                    class="group relative flex flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border p-4 transition-all duration-300 focus:outline-none"
                    :class="[
                        isFeatureAvailable(feature.id)
                            ? 'cursor-pointer hover:scale-[1.02]'
                            : 'cursor-not-allowed border-zinc-200 opacity-40 grayscale dark:border-zinc-800',
                        selectedFeatures.includes(feature.id)
                            ? `${feature.color} border-transparent shadow-lg ring-2 ring-current ring-offset-2 ring-offset-white dark:ring-offset-zinc-950`
                            : isFeatureAvailable(feature.id)
                              ? 'border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900'
                              : 'border-zinc-100 dark:border-zinc-900'
                    ]"
                    :disabled="!isFeatureAvailable(feature.id)"
                >
                    <span class="text-3xl transition-transform duration-300 group-hover:scale-110">{{
                        feature.icon
                    }}</span>

                    <div class="flex flex-col items-center">
                        <span class="text-xs font-bold tracking-wider uppercase">{{ feature.label }}</span>
                        <div
                            v-if="featurePrices?.[feature.id] !== null && featurePrices?.[feature.id] !== undefined"
                            class="mt-1 flex w-full flex-col items-center border-t border-current/10 pt-1"
                        >
                            <span class="text-[8px] font-black tracking-tighter uppercase opacity-60"
                                >Budget: {{ currency.format(featurePrices[feature.id]!) }}</span
                            >
                            <span
                                class="mt-0.5 text-[10px] leading-tight font-black"
                                :class="selectedFeatures.includes(feature.id) ? 'text-white' : 'text-emerald-500'"
                            >
                                Share: {{ currency.format(featureSplitPrices?.[feature.id] || 0) }}
                            </span>
                        </div>
                    </div>

                    <!-- Selected Indicator -->
                    <div v-if="selectedFeatures.includes(feature.id)" class="absolute top-2 right-2">
                        <i class="pi pi-check-circle text-xs"></i>
                    </div>
                </button>
            </div>

            <Divider />

            <div class="flex flex-col gap-4">
                <span class="text-sm font-bold tracking-wider text-zinc-400 uppercase">Transport</span>

                <div class="grid grid-cols-3 gap-3">
                    <button
                        v-for="option in TRANSPORT_OPTIONS"
                        :key="option.id"
                        @click="selectTransportMode(option.id)"
                        class="group relative flex cursor-pointer flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border p-4 transition-all duration-300 hover:scale-[1.02] focus:outline-none"
                        :class="[
                            transportMode === option.id
                                ? `${option.color} border-transparent shadow-lg ring-2 ring-current ring-offset-2 ring-offset-white dark:ring-offset-zinc-950`
                                : 'border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900'
                        ]"
                    >
                        <span class="text-3xl transition-transform duration-300 group-hover:scale-110">{{
                            option.icon
                        }}</span>

                        <div class="flex flex-col items-center">
                            <span class="text-xs font-bold tracking-wider uppercase">{{ option.label }}</span>
                        </div>

                        <!-- Selected Indicator -->
                        <div v-if="transportMode === option.id" class="absolute top-2 right-2">
                            <i class="pi pi-check-circle text-xs"></i>
                        </div>
                    </button>
                </div>

                <div
                    v-if="transportMode === 'DRIVER'"
                    class="animate-in fade-in slide-in-from-top-2 flex flex-col gap-4 duration-300"
                >
                    <div class="flex flex-col items-start gap-2 px-2">
                        <span class="text-xs font-bold tracking-wider text-zinc-400 uppercase">Total Seats</span>
                        <span class="text-xs text-zinc-500">Including yourself</span>
                        <div class="flex w-full items-center gap-4">
                            <Slider v-model="vehicleSeats" :min="2" :max="9" class="flex-1" />
                            <span class="w-8 text-xl font-black text-emerald-500">{{ vehicleSeats }}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <template #footer>
            <div class="flex w-full justify-end gap-2">
                <Button label="Cancel" severity="secondary" text @click="emit('update:visible', false)" />
                <Button :label="submitLabel || 'Join Event'" icon="pi pi-check" @click="onConfirm" />
            </div>
        </template>
    </Dialog>
</template>
