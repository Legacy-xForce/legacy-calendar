<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useFeaturesStore } from '../../stores/features';
import type { FeatureId } from '../../types/Event';
import { toggleFeature as toggleFeatureInSelection } from '../../utils/event';
import ToggleSwitch from 'primevue/toggleswitch';
import InputNumber from 'primevue/inputnumber';

const selectedFeatures = defineModel<FeatureId[]>('selectedFeatures', { required: true });
const featurePrices = defineModel<Record<FeatureId, number | null>>('featurePrices', { required: true });

const featuresStore = useFeaturesStore();
const FEATURES = computed(() => featuresStore.features);

onMounted(() => {
    if (featuresStore.features.length === 0) void featuresStore.fetchFeatures();
});

const toggleFeature = (feature: FeatureId) => toggleFeatureInSelection(selectedFeatures.value, feature);
</script>

<template>
    <div class="border-line bg-raised divide-line divide-y overflow-hidden rounded-2xl border">
        <div v-for="feature in FEATURES" :key="feature.id" class="flex flex-col px-4 py-2.5">
            <label class="flex cursor-pointer items-center gap-3" :for="`feature-toggle-${feature.id}`">
                <span
                    class="font-emoji bg-surface-900 flex size-9 shrink-0 items-center justify-center rounded-xl text-lg transition-opacity"
                    :class="selectedFeatures.includes(feature.id) ? '' : 'opacity-50'"
                >
                    {{ feature.emoji }}
                </span>
                <span
                    class="text-body flex-1 font-medium"
                    :class="selectedFeatures.includes(feature.id) ? 'text-fg' : 'text-muted'"
                >
                    {{ feature.name }}
                </span>
                <ToggleSwitch
                    :inputId="`feature-toggle-${feature.id}`"
                    :modelValue="selectedFeatures.includes(feature.id)"
                    @update:modelValue="toggleFeature(feature.id)"
                />
            </label>

            <div
                v-if="selectedFeatures.includes(feature.id)"
                class="animate-rise-in flex items-center gap-3 pt-2.5 pb-1 pl-12"
            >
                <label :for="`price-${feature.id}`" class="text-meta text-muted flex-1">
                    Total budget, split between everyone in
                </label>
                <InputNumber
                    :inputId="`price-${feature.id}`"
                    v-model="featurePrices[feature.id]"
                    mode="currency"
                    currency="EUR"
                    locale="de-DE"
                    placeholder="0,00 €"
                    :min="0"
                    :max="10000"
                    class="w-32 shrink-0"
                    inputClass="w-full text-right tabular"
                />
            </div>
        </div>
    </div>
</template>
