<script setup lang="ts">
import { computed } from 'vue';
import type { Event, EventFeature } from '../../../types/Event';
import { FEATURES } from '../../../constants/features';
import { formatCurrency } from '../../../utils/format';
import { injectEventView } from '../../../composables/useEventView';

defineProps<{
    event: Event;
}>();

const {
    userParticipantStatus,
    userTotalShare,
    availableFeatureIds,
    eventPrices,
    eventTotalBudget,
    currentUser,
    getFeatureCount,
    getFeatureSplitPrice,
    getParticipantFeatures
} = injectEventView();

const featureMap = computed(
    () =>
        Object.fromEntries(FEATURES.map((feature) => [feature.id, feature])) as Record<
            EventFeature,
            (typeof FEATURES)[0]
        >
);

const myFeatures = computed(() => (currentUser.value ? getParticipantFeatures(currentUser.value.id) : []));
const isGoing = computed(() => userParticipantStatus.value === 'ACCEPTED');
</script>

<template>
    <section class="flex flex-col gap-2">
        <h3 class="eyebrow m-0">Costs</h3>

        <div
            v-if="isGoing && eventTotalBudget > 0"
            class="flex items-center justify-between gap-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/8 px-4 py-3.5"
        >
            <div class="min-w-0">
                <p class="text-body text-fg m-0 font-medium">Your share</p>
                <p class="text-meta text-muted m-0">Split by what you opted into</p>
            </div>
            <p class="text-headline font-display tabular m-0 font-semibold text-emerald-300">
                {{ formatCurrency(userTotalShare) }}
            </p>
        </div>

        <div class="border-line bg-raised divide-line divide-y overflow-hidden rounded-2xl border">
            <div v-for="featureId in availableFeatureIds" :key="featureId" class="flex items-center gap-3.5 px-4 py-3">
                <span
                    class="bg-surface-900 font-emoji flex size-9 shrink-0 items-center justify-center rounded-xl text-lg"
                >
                    {{ featureMap[featureId]?.icon }}
                </span>
                <div class="min-w-0 flex-1">
                    <p class="text-body text-fg m-0 flex items-center gap-2 font-medium">
                        {{ featureMap[featureId]?.label }}
                        <i
                            v-if="isGoing && myFeatures.includes(featureId)"
                            class="pi pi-check text-[0.625rem] text-emerald-300"
                            aria-label="You opted in"
                        ></i>
                    </p>
                    <p class="text-meta text-muted tabular m-0">
                        {{ getFeatureCount(featureId) }} in
                        <template v-if="eventPrices[featureId] !== null">
                            · {{ formatCurrency(eventPrices[featureId] ?? 0) }} total
                        </template>
                    </p>
                </div>
                <div class="text-right">
                    <template v-if="eventPrices[featureId] !== null">
                        <p class="text-body text-fg tabular m-0 font-semibold">
                            {{ formatCurrency(getFeatureSplitPrice(featureId)) }}
                        </p>
                        <p class="text-meta text-subtle m-0">each</p>
                    </template>
                    <p v-else class="text-meta text-subtle m-0">No budget</p>
                </div>
            </div>
        </div>

        <p v-if="eventTotalBudget > 0" class="text-meta text-muted tabular m-0 px-1">
            Total budget {{ formatCurrency(eventTotalBudget) }}
        </p>
    </section>
</template>
