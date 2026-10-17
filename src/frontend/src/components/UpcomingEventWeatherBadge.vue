<script setup lang="ts">
import { computed, onMounted, watch } from 'vue';
import type { Event } from '../types/Event';
import { useEventWeather, mapWeatherCodeToSummary } from '../composables/useEventWeather';
import MeteoconIcon from './MeteoconIcon.vue';

const props = withDefaults(
    defineProps<{
        event: Event;
        compact?: boolean;
    }>(),
    {
        compact: true
    }
);

const emit = defineEmits<{
    (e: 'open-detail'): void;
}>();

const { getWeatherForEvent, loadWeatherForEvent } = useEventWeather();
const weather = computed(() => getWeatherForEvent(props.event.id));

const weatherInfo = computed(() => {
    if (!weather.value || weather.value.weatherCode === null) return null;
    return mapWeatherCodeToSummary(weather.value.weatherCode, weather.value.isDay);
});

onMounted(() => {
    loadWeatherForEvent(props.event);
});

watch(
    () => props.event,
    (newEv) => {
        loadWeatherForEvent(newEv);
    },
    { deep: true }
);
</script>

<template>
    <button
        v-if="weather"
        type="button"
        class="pressable bg-surface-850 hover:bg-surface-800 text-fg inline-flex h-6 shrink-0 items-center gap-1 rounded-full pr-2.5 pl-1 text-[0.75rem] leading-none font-medium"
        :aria-label="`Weather: ${weather.summary}, ${Math.round(weather.temperature ?? 0)} degrees`"
        @click.stop="emit('open-detail')"
    >
        <MeteoconIcon v-if="weatherInfo" :slug="weatherInfo.meteoconSlug" :size="20" />
        <span class="tabular">{{ Math.round(weather.temperature ?? 0) }}°</span>
        <span v-if="!compact" class="text-muted">{{ weather.summary }}</span>
    </button>
</template>
