<script setup lang="ts">
import { computed } from 'vue';
import { injectWeatherDialogState } from './useWeatherDialogState';
import MeteoconIcon from '../../../MeteoconIcon.vue';

const { displayFeelsLike, displayWind, displayPrecipitation, displayHumidity } = injectWeatherDialogState();

const stats = computed(() => [
    { label: 'Feels like', value: displayFeelsLike.value, slug: 'thermometer', unit: '°C' },
    { label: 'Wind', value: displayWind.value, slug: 'wind', unit: 'km/h' },
    { label: 'Rain chance', value: displayPrecipitation.value, slug: 'raindrop', unit: '%' },
    { label: 'Humidity', value: displayHumidity.value, slug: 'humidity', unit: '%' }
]);
</script>

<template>
    <div class="mt-4 grid grid-cols-2 gap-2">
        <div v-for="stat in stats" :key="stat.label" class="bg-surface-900 flex items-center gap-2 rounded-2xl p-2.5">
            <MeteoconIcon :slug="stat.slug" :size="40" />
            <div class="min-w-0">
                <p class="text-meta text-muted m-0">{{ stat.label }}</p>
                <p class="text-title text-fg tabular m-0 font-semibold">
                    {{ stat.value
                    }}<span v-if="stat.unit" class="text-meta text-subtle ml-0.5 font-normal">{{ stat.unit }}</span>
                </p>
            </div>
        </div>
    </div>
</template>
