<script setup lang="ts">
import { computed } from 'vue';
import Dialog from 'primevue/dialog';
import type { Event } from '../../../../types/Event';
import type { EventWeather } from '../../../../types/Weather';
import { useWeatherDialogState } from './useWeatherDialogState';

import WeatherHero from './WeatherHero.vue';
import WeatherStatsGrid from './WeatherStatsGrid.vue';
import WeatherHourlyTimeline from './WeatherHourlyTimeline.vue';
import WeatherDayPicker from './WeatherDayPicker.vue';

const props = defineProps<{
    visible: boolean;
    event: Event;
    weather: EventWeather | null;
}>();

const emit = defineEmits<{
    (e: 'update:visible', value: boolean): void;
}>();

const { selectedDay, formatDayFull, selectedHourTime, formatHour } = useWeatherDialogState(props);

const showDialog = computed({
    get: () => props.visible,
    set: (value) => emit('update:visible', value)
});
</script>

<template>
    <Dialog v-model:visible="showDialog" modal dismissableMask :draggable="false" :style="{ width: '26rem' }">
        <template #header>
            <div class="min-w-0">
                <h2 class="text-title m-0 truncate">{{ event.location }}</h2>
                <p class="text-meta text-muted tabular m-0">
                    {{ formatDayFull(selectedDay) }}
                    <template v-if="selectedHourTime"> · {{ formatHour(selectedHourTime) }}</template>
                </p>
            </div>
        </template>

        <div class="flex flex-col">
            <WeatherHero v-if="weather" />
            <WeatherStatsGrid v-if="weather" />
            <WeatherHourlyTimeline v-if="weather" />
            <WeatherDayPicker v-if="weather" />

            <!-- Provider footer -->
            <p class="text-subtle m-0 mt-5 text-center text-[0.6875rem]">Forecast by Open-Meteo</p>
        </div>
    </Dialog>
</template>
